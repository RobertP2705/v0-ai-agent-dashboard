"""Swarm orchestrator -- triages queries, fans out to agents, persists to Supabase."""

from __future__ import annotations

import json
import time
from typing import Any, Generator

from .agents.base import AgentEvent, AgentResult, CancelledError
from .agents import AGENT_CLASSES
from .config import TRIAGE_SYSTEM_PROMPT
from . import db


def get_task(task_id: str) -> dict | None:
    return db.get_task(task_id)


def list_tasks(limit: int = 20) -> list[dict]:
    return db.list_tasks(limit=limit)


def run_research(
    query: str,
    model_remote: Any,
    team_id: str | None = None,
) -> Generator[dict, None, dict]:
    """Full orchestration pipeline: triage -> fan-out -> merge.

    Yields event dicts as they happen for SSE streaming.
    All state is persisted to Supabase.
    """
    try:
        task_row = db.create_task(query=query, team_id=team_id)
    except Exception as exc:
        yield _event("none", "system", "error", f"Database error: {exc}")
        return {}

    task_id = task_row["id"]

    db.update_task(task_id, {"status": "triaging"})
    yield _event(task_id, "system", "thought", f"Received query: {query}")

    available_agents = _get_team_agents(team_id) if team_id else list(AGENT_CLASSES.keys())

    yield _event(task_id, "system", "action", f"Routing query to model (agents: {', '.join(available_agents)})...")
    try:
        routing = _triage(query, model_remote, available_agents)
    except Exception as exc:
        yield _event(task_id, "system", "error", f"Triage failed: {exc}")
        db.update_task(task_id, {"status": "error"})
        return db.get_task(task_id) or {}

    assigned = routing.get("agents", [available_agents[0]] if available_agents else ["paper-collector"])
    sub_tasks = routing.get("sub_tasks", {})

    db.update_task(task_id, {
        "status": "running",
        "assigned_agents": assigned,
    })

    yield _event(task_id, "system", "action", f"Routing to agents: {', '.join(assigned)}")

    agent_results: dict[str, AgentResult] = {}

    for agent_id in assigned:
        sub_task = sub_tasks.get(agent_id, query)
        agent_cls = AGENT_CLASSES.get(agent_id)
        if not agent_cls:
            yield _event(task_id, "system", "error", f"Unknown agent: {agent_id}")
            continue

        agent = agent_cls(model_remote, task_id=task_id)
        yield _event(task_id, agent.agent_name, "thought", f"Starting: {sub_task}")

        try:
            gen = agent.run(sub_task)
            result = None
            try:
                while True:
                    event = next(gen)
                    yield _event(task_id, event.agent_name, event.event_type, event.message)
            except StopIteration as stop:
                result = stop.value

            if result:
                agent_results[agent_id] = result
                if agent_id == "research-director" and result.answer:
                    _save_direction(task_id, result.answer)
        except CancelledError:
            yield _event(task_id, agent.agent_name, "error", "Cancelled by user")
            db.update_task(task_id, {"status": "cancelled"})
            return db.get_task(task_id) or {}
        except Exception as exc:
            yield _event(task_id, agent.agent_name, "error", f"Agent failed: {exc}")

    yield _event(task_id, "system", "action", "Synthesizing results...")
    try:
        merged = _merge_results(query, agent_results, model_remote)
    except Exception as exc:
        merged = f"Merge failed: {exc}"
        yield _event(task_id, "system", "error", merged)

    usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    for r in agent_results.values():
        for k in usage:
            usage[k] += r.usage.get(k, 0)

    db.update_task(task_id, {
        "status": "completed",
        "merged_answer": merged,
        "total_usage": usage,
    })

    yield _event(task_id, "system", "result", merged)
    return db.get_task(task_id)


def _get_team_agents(team_id: str) -> list[str]:
    """Return agent type IDs enabled for a given team."""
    team = db.get_team(team_id)
    if not team or not team.get("team_agents"):
        return list(AGENT_CLASSES.keys())
    return [
        ta["agent_type"]
        for ta in team["team_agents"]
        if ta.get("enabled", True) and ta["agent_type"] in AGENT_CLASSES
    ]


def _triage(query: str, model_remote: Any, available_agents: list[str]) -> dict:
    agent_list = "\n".join(f"- {aid}" for aid in available_agents)
    prompt = TRIAGE_SYSTEM_PROMPT + f"\n\nAvailable agents for this team:\n{agent_list}"

    response = model_remote.generate.remote(
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": query},
        ],
        temperature=0.3,
        max_tokens=256,
        enable_thinking=False,
    )
    text = response.get("content", "") or ""
    try:
        start = text.index("{")
        end = text.rindex("}") + 1
        parsed = json.loads(text[start:end])
        parsed["agents"] = [a for a in parsed.get("agents", []) if a in available_agents]
        if not parsed["agents"]:
            parsed["agents"] = [available_agents[0]]
        return parsed
    except (ValueError, json.JSONDecodeError):
        return {"agents": [available_agents[0]], "sub_tasks": {available_agents[0]: query}}


def _merge_results(
    original_query: str,
    agent_results: dict[str, AgentResult],
    model_remote: Any,
) -> str:
    if len(agent_results) <= 1:
        return next(iter(agent_results.values())).answer if agent_results else ""

    sections = []
    for agent_id, result in agent_results.items():
        sections.append(f"## {result.agent_name}\n{result.answer}")

    merge_prompt = (
        f"The user asked: {original_query}\n\n"
        "Multiple research agents produced the following findings:\n\n"
        + "\n\n---\n\n".join(sections)
        + "\n\nSynthesize these into a single, well-structured research report. "
        "Remove redundancy, highlight key insights, and note any contradictions."
    )

    response = model_remote.generate.remote(
        messages=[
            {"role": "system", "content": "You synthesize research findings into coherent reports."},
            {"role": "user", "content": merge_prompt},
        ],
        temperature=0.5,
        max_tokens=4096,
        enable_thinking=False,
    )
    return response.get("content", "")


def _save_direction(task_id: str, answer: str):
    """Extract and persist a research direction from the research director's output."""
    try:
        title = answer.split("\n")[0][:200].strip("# ").strip()
        if not title:
            title = "Research direction"
        db.insert_direction(
            task_id=task_id,
            title=title,
            rationale=answer[:2000],
        )
    except Exception:
        pass


def _event(task_id: str, agent: str, event_type: str, message: str) -> dict:
    return {
        "task_id": task_id,
        "agent": agent,
        "type": event_type,
        "message": message,
        "timestamp": time.time(),
    }
