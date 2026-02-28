"""FastAPI web endpoint deployed on Modal.

Exposes team CRUD, research task submission with streaming,
and query endpoints for papers, experiments, and research directions.
"""

from __future__ import annotations

import asyncio
import json
import queue
import threading
from typing import AsyncGenerator

import modal
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .config import AGENT_DEFINITIONS
from .orchestrator import get_task, list_tasks, run_research
from .serve_model import app as modal_app, Qwen3Model
from . import db

app = modal_app

web_app = FastAPI(title="Research Swarm API")

web_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / response models ─────────────────────────────────────────────

class ResearchRequest(BaseModel):
    query: str
    team_id: str | None = None

class TeamCreate(BaseModel):
    name: str
    description: str = ""

class TeamUpdate(BaseModel):
    name: str | None = None
    description: str | None = None

class AgentAssign(BaseModel):
    agent_type: str
    config: dict | None = None

class AgentToggle(BaseModel):
    enabled: bool


# ── Agent definitions ──────────────────────────────────────────────────────

@web_app.get("/agents")
async def get_agents() -> list[dict]:
    from datetime import datetime, timezone, timedelta

    tasks = list_tasks(limit=50)
    busy: dict[str, str] = {}
    stale_cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)

    for t in tasks:
        status = t.get("status")
        if status not in ("running", "triaging"):
            continue
        created = t.get("created_at", "")
        try:
            task_time = datetime.fromisoformat(created.replace("Z", "+00:00"))
            if task_time < stale_cutoff:
                db.update_task(t["id"], {"status": "error"})
                continue
        except (ValueError, TypeError):
            pass

        for aid in (t.get("assigned_agents") or []):
            busy[aid] = (t.get("query") or "")[:100]

    return [
        {
            "id": aid,
            "name": defn["name"],
            "description": defn["description"],
            "tools": defn["tools"],
            "scalable": True,
            "status": "busy" if aid in busy else "idle",
            "task": busy.get(aid, ""),
        }
        for aid, defn in AGENT_DEFINITIONS.items()
    ]


class AgentScale(BaseModel):
    agent_type: str
    count: int


@web_app.post("/teams/{team_id}/agents/scale")
async def scale_agent_endpoint(team_id: str, body: AgentScale):
    """Add or remove instances of an agent type to reach the desired count."""
    if body.agent_type not in AGENT_DEFINITIONS:
        raise HTTPException(400, f"Unknown agent type: {body.agent_type}")
    if body.count < 0 or body.count > 10:
        raise HTTPException(400, "Count must be between 0 and 10")

    team = db.get_team(team_id)
    if not team:
        raise HTTPException(404, "Team not found")

    existing = [
        ta for ta in (team.get("team_agents") or [])
        if ta["agent_type"] == body.agent_type
    ]
    current = len(existing)

    if body.count > current:
        for _ in range(body.count - current):
            db.add_agent_to_team(team_id, body.agent_type)
    elif body.count < current:
        to_remove = existing[body.count:]
        for ta in to_remove:
            db.remove_agent_from_team(ta["id"])

    return {"agent_type": body.agent_type, "previous": current, "current": body.count}


# ── Teams CRUD ─────────────────────────────────────────────────────────────

@web_app.get("/teams")
async def list_teams_endpoint():
    return db.list_teams()

@web_app.post("/teams")
async def create_team_endpoint(body: TeamCreate):
    return db.create_team(name=body.name, description=body.description)

@web_app.get("/teams/{team_id}")
async def get_team_endpoint(team_id: str):
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    return team

@web_app.put("/teams/{team_id}")
async def update_team_endpoint(team_id: str, body: TeamUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    return db.update_team(team_id, updates)

@web_app.delete("/teams/{team_id}")
async def delete_team_endpoint(team_id: str):
    db.delete_team(team_id)
    return {"ok": True}

@web_app.post("/teams/{team_id}/agents")
async def add_agent_endpoint(team_id: str, body: AgentAssign):
    if body.agent_type not in AGENT_DEFINITIONS:
        raise HTTPException(400, f"Unknown agent type: {body.agent_type}")
    return db.add_agent_to_team(team_id, body.agent_type, body.config)

@web_app.delete("/teams/{team_id}/agents/{agent_row_id}")
async def remove_agent_endpoint(team_id: str, agent_row_id: str):
    db.remove_agent_from_team(agent_row_id)
    return {"ok": True}

@web_app.patch("/teams/{team_id}/agents/{agent_row_id}")
async def toggle_agent_endpoint(team_id: str, agent_row_id: str, body: AgentToggle):
    return db.update_team_agent(agent_row_id, {"enabled": body.enabled})


# ── Research tasks ─────────────────────────────────────────────────────────

@web_app.post("/research")
async def submit_research(req: ResearchRequest) -> dict:
    model = Qwen3Model()

    def _run():
        gen = run_research(req.query, model, team_id=req.team_id)
        for _ in gen:
            pass

    await asyncio.get_event_loop().run_in_executor(None, _run)
    return {"status": "completed"}


@web_app.post("/research/stream")
async def submit_research_stream(req: ResearchRequest) -> StreamingResponse:
    model = Qwen3Model()
    q: queue.Queue[dict | None] = queue.Queue()

    def _run():
        try:
            gen = run_research(req.query, model, team_id=req.team_id)
            for event in gen:
                q.put(event)
        except Exception as exc:
            from .agents.base import CancelledError
            if isinstance(exc, CancelledError):
                q.put({
                    "task_id": "cancelled",
                    "agent": "system",
                    "type": "error",
                    "message": "Cancelled by user",
                    "timestamp": __import__("time").time(),
                })
            else:
                q.put({
                    "task_id": "error",
                    "agent": "system",
                    "type": "error",
                    "message": str(exc),
                    "timestamp": __import__("time").time(),
                })
        finally:
            q.put(None)

    threading.Thread(target=_run, daemon=True).start()

    async def event_generator() -> AsyncGenerator[str, None]:
        while True:
            while q.empty():
                await asyncio.sleep(0.05)
            item = q.get()
            if item is None:
                break
            yield f"data: {json.dumps(item)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@web_app.get("/tasks")
async def get_tasks_endpoint():
    return list_tasks(limit=20)

@web_app.get("/tasks/{task_id}")
async def get_task_endpoint(task_id: str):
    task = get_task(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    return task

@web_app.post("/tasks/{task_id}/cancel")
async def cancel_task_endpoint(task_id: str):
    task = get_task(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    db.update_task(task_id, {"status": "cancelled"})
    return {"ok": True}

@web_app.get("/tasks/{task_id}/events")
async def get_task_events_endpoint(task_id: str):
    return db.list_events(task_id)


# ── Papers, experiments, directions ────────────────────────────────────────

@web_app.get("/papers")
async def list_papers_endpoint(task_id: str | None = None):
    return db.list_papers(task_id=task_id)

@web_app.get("/experiments")
async def list_experiments_endpoint(task_id: str | None = None):
    return db.list_experiments(task_id=task_id)

@web_app.get("/directions")
async def list_directions_endpoint(task_id: str | None = None):
    return db.list_directions(task_id=task_id)


# ── Mount onto Modal ──────────────────────────────────────────────────────

@modal_app.function(
    image=modal.Image.debian_slim(python_version="3.11").pip_install(
        "fastapi", "uvicorn", "sse-starlette", "pydantic>=2.10", "httpx",
        "arxiv>=2.1", "supabase>=2.11", "wandb>=0.19", "PyGithub>=2.5",
    ),
    secrets=[
        modal.Secret.from_name("huggingface-secret"),
        modal.Secret.from_name("search-api-keys"),
        modal.Secret.from_name("supabase-secret"),
    ],
    timeout=1800,
    allow_concurrent_inputs=100,
)
@modal.asgi_app()
def api():
    return web_app
