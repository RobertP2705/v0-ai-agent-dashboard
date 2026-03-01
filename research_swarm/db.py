"""Supabase database wrapper for the research swarm.

All persistence goes through this module -- teams, tasks, events, papers,
experiments, and research directions.
"""

from __future__ import annotations

import os
from typing import Any


class DBError(RuntimeError):
    """Raised when a Supabase operation returns no data unexpectedly."""


def _get_client():
    from supabase import create_client
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise DBError(
            "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in environment. "
            "Check your Modal secrets."
        )
    return create_client(url, key)


def _first(result, table: str, op: str = "operation") -> dict:
    """Safely extract the first row from a Supabase response."""
    data = result.data if hasattr(result, "data") else result
    if not data:
        raise DBError(
            f"Supabase {op} on '{table}' returned no rows. "
            "This usually means RLS is blocking the request — verify that "
            "SUPABASE_SERVICE_ROLE_KEY (not the anon key) is set in Modal secrets."
        )
    return data[0]


def _first_or_none(result) -> dict | None:
    data = result.data if hasattr(result, "data") else result
    return data[0] if data else None


# ── Teams ──────────────────────────────────────────────────────────────────

def list_teams() -> list[dict]:
    sb = _get_client()
    return sb.table("teams").select("*, team_agents(*)").order("created_at", desc=True).execute().data

def get_team(team_id: str) -> dict | None:
    sb = _get_client()
    res = sb.table("teams").select("*, team_agents(*)").eq("id", team_id).execute()
    return _first_or_none(res)

def create_team(name: str, description: str = "") -> dict:
    sb = _get_client()
    res = sb.table("teams").insert({"name": name, "description": description}).execute()
    return _first(res, "teams", "insert")

def update_team(team_id: str, updates: dict) -> dict:
    sb = _get_client()
    res = sb.table("teams").update(updates).eq("id", team_id).execute()
    return _first(res, "teams", "update")

def delete_team(team_id: str) -> None:
    sb = _get_client()
    sb.table("teams").delete().eq("id", team_id).execute()


# ── Team agents ────────────────────────────────────────────────────────────

def add_agent_to_team(team_id: str, agent_type: str, config: dict | None = None) -> dict:
    sb = _get_client()
    res = sb.table("team_agents").insert({
        "team_id": team_id,
        "agent_type": agent_type,
        "config": config or {},
        "enabled": True,
    }).execute()
    return _first(res, "team_agents", "insert")

def remove_agent_from_team(agent_row_id: str) -> None:
    sb = _get_client()
    sb.table("team_agents").delete().eq("id", agent_row_id).execute()

def update_team_agent(agent_row_id: str, updates: dict) -> dict:
    sb = _get_client()
    res = sb.table("team_agents").update(updates).eq("id", agent_row_id).execute()
    return _first(res, "team_agents", "update")


# ── Tasks ──────────────────────────────────────────────────────────────────

def create_task(query: str, team_id: str | None = None, project_id: str | None = None) -> dict:
    sb = _get_client()
    row: dict[str, Any] = {"query": query, "status": "pending"}
    if team_id:
        row["team_id"] = team_id
    if project_id:
        row["project_id"] = project_id
    res = sb.table("tasks").insert(row).execute()
    return _first(res, "tasks", "insert")

def update_task(task_id: str, updates: dict) -> dict | None:
    """Update a task. Returns the row, or None if no row matched (non-fatal)."""
    try:
        sb = _get_client()
        res = sb.table("tasks").update(updates).eq("id", task_id).execute()
        return _first_or_none(res)
    except Exception:
        return None

def get_task(task_id: str) -> dict | None:
    sb = _get_client()
    res = sb.table("tasks").select("*").eq("id", task_id).execute()
    return _first_or_none(res)

def list_tasks(limit: int = 20) -> list[dict]:
    sb = _get_client()
    return sb.table("tasks").select("*").order("created_at", desc=True).limit(limit).execute().data


# ── Task events ────────────────────────────────────────────────────────────

def insert_event(task_id: str, agent_type: str, event_type: str, message: str, meta: dict | None = None) -> dict | None:
    """Insert a task event. Returns the row, or None on failure (non-fatal)."""
    try:
        sb = _get_client()
        res = sb.table("task_events").insert({
            "task_id": task_id,
            "agent_type": agent_type,
            "event_type": event_type,
            "message": message,
            "meta": meta or {},
        }).execute()
        return _first_or_none(res)
    except Exception:
        return None

def list_events(task_id: str) -> list[dict]:
    sb = _get_client()
    return sb.table("task_events").select("*").eq("task_id", task_id).order("created_at").execute().data


# ── Papers ─────────────────────────────────────────────────────────────────

def insert_paper(task_id: str, arxiv_id: str, title: str, authors: list[str],
                 abstract: str, summary: str, pdf_url: str) -> dict | None:
    try:
        sb = _get_client()
        res = sb.table("papers").insert({
            "task_id": task_id,
            "arxiv_id": arxiv_id,
            "title": title,
            "authors": authors,
            "abstract": abstract,
            "summary": summary,
            "pdf_url": pdf_url,
        }).execute()
        return _first_or_none(res)
    except Exception:
        return None

def list_papers(task_id: str | None = None, limit: int = 50) -> list[dict]:
    sb = _get_client()
    q = sb.table("papers").select("*").order("created_at", desc=True).limit(limit)
    if task_id:
        q = q.eq("task_id", task_id)
    return q.execute().data


# ── Experiments ────────────────────────────────────────────────────────────

def insert_experiment(task_id: str, paper_id: str | None, code: str,
                      wandb_run_url: str = "", github_repo: str = "",
                      github_commit: str = "", status: str = "pending",
                      metrics: dict | None = None) -> dict | None:
    try:
        sb = _get_client()
        res = sb.table("experiments").insert({
            "task_id": task_id,
            "paper_id": paper_id,
            "code": code,
            "wandb_run_url": wandb_run_url,
            "github_repo": github_repo,
            "github_commit": github_commit,
            "status": status,
            "metrics": metrics or {},
        }).execute()
        return _first_or_none(res)
    except Exception:
        return None

def update_experiment(exp_id: str, updates: dict) -> dict | None:
    try:
        sb = _get_client()
        res = sb.table("experiments").update(updates).eq("id", exp_id).execute()
        return _first_or_none(res)
    except Exception:
        return None

def list_experiments(task_id: str | None = None, limit: int = 50) -> list[dict]:
    sb = _get_client()
    q = sb.table("experiments").select("*").order("created_at", desc=True).limit(limit)
    if task_id:
        q = q.eq("task_id", task_id)
    return q.execute().data


# ── Research directions ────────────────────────────────────────────────────

def insert_direction(task_id: str, title: str, rationale: str,
                     feasibility_score: float = 0, novelty_score: float = 0,
                     related_papers: list[str] | None = None) -> dict | None:
    try:
        sb = _get_client()
        res = sb.table("research_directions").insert({
            "task_id": task_id,
            "title": title,
            "rationale": rationale,
            "feasibility_score": feasibility_score,
            "novelty_score": novelty_score,
            "related_papers": related_papers or [],
        }).execute()
        return _first_or_none(res)
    except Exception:
        return None

def list_directions(task_id: str | None = None, limit: int = 50) -> list[dict]:
    sb = _get_client()
    q = sb.table("research_directions").select("*").order("created_at", desc=True).limit(limit)
    if task_id:
        q = q.eq("task_id", task_id)
    return q.execute().data
