"""Supabase database wrapper for the research swarm.

All persistence goes through this module -- teams, tasks, events, papers,
experiments, and research directions.
"""

from __future__ import annotations

import os
import time
from typing import Any


def _get_client():
    from supabase import create_client
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


# ── Teams ──────────────────────────────────────────────────────────────────

def list_teams() -> list[dict]:
    sb = _get_client()
    return sb.table("teams").select("*, team_agents(*)").order("created_at", desc=True).execute().data

def get_team(team_id: str) -> dict | None:
    sb = _get_client()
    rows = sb.table("teams").select("*, team_agents(*)").eq("id", team_id).execute().data
    return rows[0] if rows else None

def create_team(name: str, description: str = "") -> dict:
    sb = _get_client()
    return sb.table("teams").insert({"name": name, "description": description}).execute().data[0]

def update_team(team_id: str, updates: dict) -> dict:
    sb = _get_client()
    return sb.table("teams").update(updates).eq("id", team_id).execute().data[0]

def delete_team(team_id: str) -> None:
    sb = _get_client()
    sb.table("teams").delete().eq("id", team_id).execute()


# ── Team agents ────────────────────────────────────────────────────────────

def add_agent_to_team(team_id: str, agent_type: str, config: dict | None = None) -> dict:
    sb = _get_client()
    return sb.table("team_agents").insert({
        "team_id": team_id,
        "agent_type": agent_type,
        "config": config or {},
        "enabled": True,
    }).execute().data[0]

def remove_agent_from_team(agent_row_id: str) -> None:
    sb = _get_client()
    sb.table("team_agents").delete().eq("id", agent_row_id).execute()

def update_team_agent(agent_row_id: str, updates: dict) -> dict:
    sb = _get_client()
    return sb.table("team_agents").update(updates).eq("id", agent_row_id).execute().data[0]


# ── Tasks ──────────────────────────────────────────────────────────────────

def create_task(query: str, team_id: str | None = None) -> dict:
    sb = _get_client()
    row: dict[str, Any] = {"query": query, "status": "pending"}
    if team_id:
        row["team_id"] = team_id
    return sb.table("tasks").insert(row).execute().data[0]

def update_task(task_id: str, updates: dict) -> dict:
    sb = _get_client()
    return sb.table("tasks").update(updates).eq("id", task_id).execute().data[0]

def get_task(task_id: str) -> dict | None:
    sb = _get_client()
    rows = sb.table("tasks").select("*").eq("id", task_id).execute().data
    return rows[0] if rows else None

def list_tasks(limit: int = 20) -> list[dict]:
    sb = _get_client()
    return sb.table("tasks").select("*").order("created_at", desc=True).limit(limit).execute().data


# ── Task events ────────────────────────────────────────────────────────────

def insert_event(task_id: str, agent_type: str, event_type: str, message: str, meta: dict | None = None) -> dict:
    sb = _get_client()
    return sb.table("task_events").insert({
        "task_id": task_id,
        "agent_type": agent_type,
        "event_type": event_type,
        "message": message,
        "meta": meta or {},
    }).execute().data[0]

def list_events(task_id: str) -> list[dict]:
    sb = _get_client()
    return sb.table("task_events").select("*").eq("task_id", task_id).order("created_at").execute().data


# ── Papers ─────────────────────────────────────────────────────────────────

def insert_paper(task_id: str, arxiv_id: str, title: str, authors: list[str],
                 abstract: str, summary: str, pdf_url: str) -> dict:
    sb = _get_client()
    return sb.table("papers").insert({
        "task_id": task_id,
        "arxiv_id": arxiv_id,
        "title": title,
        "authors": authors,
        "abstract": abstract,
        "summary": summary,
        "pdf_url": pdf_url,
    }).execute().data[0]

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
                      metrics: dict | None = None) -> dict:
    sb = _get_client()
    return sb.table("experiments").insert({
        "task_id": task_id,
        "paper_id": paper_id,
        "code": code,
        "wandb_run_url": wandb_run_url,
        "github_repo": github_repo,
        "github_commit": github_commit,
        "status": status,
        "metrics": metrics or {},
    }).execute().data[0]

def update_experiment(exp_id: str, updates: dict) -> dict:
    sb = _get_client()
    return sb.table("experiments").update(updates).eq("id", exp_id).execute().data[0]

def list_experiments(task_id: str | None = None, limit: int = 50) -> list[dict]:
    sb = _get_client()
    q = sb.table("experiments").select("*").order("created_at", desc=True).limit(limit)
    if task_id:
        q = q.eq("task_id", task_id)
    return q.execute().data


# ── Research directions ────────────────────────────────────────────────────

def insert_direction(task_id: str, title: str, rationale: str,
                     feasibility_score: float = 0, novelty_score: float = 0,
                     related_papers: list[str] | None = None) -> dict:
    sb = _get_client()
    return sb.table("research_directions").insert({
        "task_id": task_id,
        "title": title,
        "rationale": rationale,
        "feasibility_score": feasibility_score,
        "novelty_score": novelty_score,
        "related_papers": related_papers or [],
    }).execute().data[0]

def list_directions(task_id: str | None = None, limit: int = 50) -> list[dict]:
    sb = _get_client()
    q = sb.table("research_directions").select("*").order("created_at", desc=True).limit(limit)
    if task_id:
        q = q.eq("task_id", task_id)
    return q.execute().data
