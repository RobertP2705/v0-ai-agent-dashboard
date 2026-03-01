"""FastAPI web endpoint deployed on Modal.

Exposes team CRUD, research task submission with streaming,
and query endpoints for papers, experiments, and research directions.
"""

from __future__ import annotations

import asyncio
import json
import queue
import threading
import time
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

# In-process tracking of active research sessions for real-time agent status.
# Each entry maps a session key to the set of agent IDs active in that session.
_active_sessions: dict[str, set[str]] = {}
_sessions_lock = threading.Lock()

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
    query: str = ""
    team_id: str | None = None
    project_id: str | None = None
    memory_context: list[dict] | None = None
    continue_task_id: str | None = None

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


class TestReportPdfRequest(BaseModel):
    """Optional project_id so the test report appears in that project's list."""
    project_id: str | None = None


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

    # Merge in-process active sessions (catches tasks between DB polls)
    with _sessions_lock:
        for agent_ids in _active_sessions.values():
            for aid in agent_ids:
                if aid in AGENT_DEFINITIONS and aid not in busy:
                    busy[aid] = "Processing research query..."

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


@web_app.get("/model/status")
async def model_status():
    """Real-time model status: active sessions and which agents are working."""
    with _sessions_lock:
        all_agents: dict[str, str] = {}
        for agent_ids in _active_sessions.values():
            for aid in agent_ids:
                all_agents[aid] = "busy"
        return {
            "active_sessions": len(_active_sessions),
            "active_agents": all_agents,
        }


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
    session_key = f"s-{id(req)}-{time.time()}"
    _name_to_id = {defn["name"]: aid for aid, defn in AGENT_DEFINITIONS.items()}

    def _run():
        with _sessions_lock:
            _active_sessions[session_key] = set()
        try:
            gen = run_research(req.query, model, team_id=req.team_id, project_id=req.project_id, memory_context=req.memory_context)
            for event in gen:
                agent_name = event.get("agent", "")
                if agent_name and agent_name != "system":
                    base_name = agent_name.rsplit(" #", 1)[0]
                    agent_id = _name_to_id.get(base_name)
                    if agent_id:
                        with _sessions_lock:
                            if session_key in _active_sessions:
                                _active_sessions[session_key].add(agent_id)
        finally:
            with _sessions_lock:
                _active_sessions.pop(session_key, None)

    await asyncio.get_event_loop().run_in_executor(None, _run)
    return {"status": "completed"}


@web_app.post("/research/stream")
async def submit_research_stream(req: ResearchRequest) -> StreamingResponse:
    model = Qwen3Model()
    q: queue.Queue[dict | None] = queue.Queue()
    session_key = f"s-{id(req)}-{time.time()}"

    # Pre-register session so /agents immediately shows busy
    with _sessions_lock:
        _active_sessions[session_key] = set()

    # Map display names back to agent IDs for status tracking
    _name_to_id = {defn["name"]: aid for aid, defn in AGENT_DEFINITIONS.items()}

    def _run():
        try:
            gen = run_research(
                req.query,
                model,
                team_id=req.team_id,
                project_id=req.project_id,
                memory_context=req.memory_context,
                existing_task_id=req.continue_task_id,
            )
            for event in gen:
                # Track which agents are active from stream events
                agent_name = event.get("agent", "")
                if agent_name and agent_name != "system":
                    base_name = agent_name.rsplit(" #", 1)[0]
                    agent_id = _name_to_id.get(base_name)
                    if agent_id:
                        with _sessions_lock:
                            if session_key in _active_sessions:
                                _active_sessions[session_key].add(agent_id)
                q.put(event)
        except Exception as exc:
            from .agents.base import CancelledError
            if isinstance(exc, CancelledError):
                q.put({
                    "task_id": "cancelled",
                    "agent": "system",
                    "type": "error",
                    "message": "Cancelled by user",
                    "timestamp": time.time(),
                })
            else:
                q.put({
                    "task_id": "error",
                    "agent": "system",
                    "type": "error",
                    "message": str(exc),
                    "timestamp": time.time(),
                })
        finally:
            with _sessions_lock:
                _active_sessions.pop(session_key, None)
            q.put(None)

    threading.Thread(target=_run, daemon=True).start()

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            while True:
                while q.empty():
                    await asyncio.sleep(0.05)
                item = q.get()
                if item is None:
                    break
                yield f"data: {json.dumps(item)}\n\n"
            yield "data: [DONE]\n\n"
        finally:
            # Clean up if client disconnects early
            with _sessions_lock:
                _active_sessions.pop(session_key, None)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@web_app.post("/research/test-report-pdf")
async def test_report_pdf(req: TestReportPdfRequest) -> dict:
    """Invoke the PDF report tool with sample data (no agents). Use to verify storage/env."""
    from .tools.report_pdf import create_report_pdf

    task_row = db.create_task(
        query="Test PDF report",
        team_id=None,
        project_id=req.project_id,
    )
    task_id = task_row["id"]
    result = create_report_pdf(
        task_id=task_id,
        title="Test Report",
        abstract="This is a test PDF generated by the dashboard test button.",
        sections=[
            {"heading": "Purpose", "body": "Verifies PDF build, Supabase storage upload, and task_reports insert."},
        ],
        figures=None,
    )
    return result


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


# ── Meeting summary ────────────────────────────────────────────────────────

class SummarizeMeetingRequest(BaseModel):
    events: list[dict]
    project_context: str = ""


_MEETING_SUMMARY_SYSTEM = """\
You are a meeting summarizer for a multi-agent AI research swarm. You will receive the event log of a research session containing agent thoughts, actions, and results from agents named Paper Collector, Implementer, and Research Director.

Your task: rewrite this into a natural roundtable conversation between the agents. Each agent should speak in character about their contributions:
- Paper Collector: discusses papers found, key findings, sources
- Implementer: discusses code written, experiments run, technical results
- Research Director: discusses strategy, promising directions, synthesis

Rules:
- Output ONLY a JSON array of objects: [{"agent": "Paper Collector", "message": "..."}, ...]
- Use the exact agent names: "Paper Collector", "Implementer", "Research Director"
- Keep it concise and conversational — summarize, don't repeat verbatim logs
- 8-20 exchanges total depending on session complexity
- Each message should be 1-3 sentences, natural spoken language (this will be read aloud via TTS)
- Avoid markdown formatting, code blocks, or URLs in messages — keep it speakable
- If an agent had no activity, they can still comment briefly or be omitted
- Start with a brief overview of what was researched, end with next steps or conclusions
- Do NOT include any text outside the JSON array\
"""


@web_app.post("/research/summarize-meeting")
async def summarize_meeting(req: SummarizeMeetingRequest):
    """Summarize research events into a structured multi-agent conversation."""
    if not req.events:
        raise HTTPException(400, "No events provided")

    history_lines: list[str] = []
    for ev in req.events:
        agent = ev.get("agent", "system")
        ev_type = ev.get("type", "")
        text = ev.get("message", "")
        if agent in ("system", "User") or not text.strip():
            continue
        history_lines.append(f"[{agent} / {ev_type}]: {text[:1000]}")

    if not history_lines:
        raise HTTPException(400, "Events contained no usable content")

    context_block = "\n".join(history_lines[-300:])
    user_prompt = context_block
    if req.project_context:
        user_prompt = f"Project: {req.project_context}\n\n{context_block}"

    model = Qwen3Model()
    result = model.generate.remote(
        messages=[
            {"role": "system", "content": _MEETING_SUMMARY_SYSTEM},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
        max_tokens=4096,
    )

    content = (result.get("content") or "").strip()

    # Parse the JSON array from the response
    start = content.find("[")
    end = content.rfind("]")
    if start == -1 or end == -1:
        raise HTTPException(502, "Model did not return valid JSON conversation")

    try:
        conversation = json.loads(content[start:end + 1])
    except json.JSONDecodeError:
        raise HTTPException(502, "Model returned malformed JSON")

    if not isinstance(conversation, list):
        raise HTTPException(502, "Model response was not a JSON array")

    validated: list[dict] = []
    for i, entry in enumerate(conversation):
        if isinstance(entry, dict) and "agent" in entry and "message" in entry:
            validated.append({
                "agent": str(entry["agent"]),
                "message": str(entry["message"]),
            })

    if not validated:
        raise HTTPException(502, "Model returned no valid conversation entries")

    return {"conversation": validated}


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
        "reportlab>=4.2",
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
