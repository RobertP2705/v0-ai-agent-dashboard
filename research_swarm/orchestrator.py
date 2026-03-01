"""Swarm orchestrator -- triages queries, fans out to agents in parallel, merges results."""

from __future__ import annotations

import json
import queue
import threading
import time
from typing import Any, Generator

from .agents.base import AgentResult, CancelledError
from .agents import AGENT_CLASSES
from .config import AGENT_DEFINITIONS, TRIAGE_SYSTEM_PROMPT
from . import db


def get_task(task_id: str) -> dict | None:
    return db.get_task(task_id)


def list_tasks(limit: int = 20) -> list[dict]:
    return db.list_tasks(limit=limit)


def run_research(
    query: str,
    model_remote: Any,
    team_id: str | None = None,
    memory_context: list[dict] | None = None,
) -> Generator[dict, None, dict]:
    """Full orchestration pipeline: triage -> parallel fan-out -> merge.

    Yields event dicts as they happen for SSE streaming.
    All state is persisted to Supabase.
    """
    if memory_context:
        context_block = "\n\n".join(
            m["content"] for m in memory_context if isinstance(m.get("content"), str)
        )
        augmented_query = (
            f"## Relevant context from previous conversations:\n"
            f"{context_block}\n\n"
            f"## Current request:\n{query}"
        )
    else:
        augmented_query = query

    try:
        task_row = db.create_task(query=query, team_id=team_id)
    except Exception as exc:
        yield _event("none", "system", "error",
                      f"Database error creating task: {exc}")
        return {}

    task_id = task_row["id"]

    db.update_task(task_id, {"status": "triaging"})
    yield _event(task_id, "system", "thought", f"Received query: {query}")

    agent_counts = _get_team_agent_counts(team_id)

    counts_str = ", ".join(f"{a} x{c}" for a, c in agent_counts.items())
    yield _event(task_id, "system", "action", f"Routing query to model ({counts_str})...")

    try:
        routing = _triage(augmented_query, model_remote, agent_counts)
    except Exception as exc:
        msg = str(exc)
        # If Modal couldn't deserialize the remote exception, the message often contains "remote traceback"
        if "remote traceback" in msg.lower() or "deserialization failed" in msg.lower():
            msg = (
                "Model server error (vLLM engine may have crashed or OOM). "
                "Check Modal logs for the remote traceback. "
                "Original: " + msg[:500]
            )
        yield _event(task_id, "system", "error", f"Triage failed: {msg}")
        db.update_task(task_id, {"status": "error"})
        return db.get_task(task_id) or {}

    roster = _build_roster(routing, agent_counts, augmented_query)

    all_agent_ids = list({agent_id for agent_id, _, _ in roster})
    db.update_task(task_id, {
        "status": "running",
        "assigned_agents": all_agent_ids,
    })

    # Phase 1: collectors (paper-collector, research-director). Phase 2: implementer runs after with their results.
    PHASE1_AGENTS = {"paper-collector", "research-director"}
    PHASE2_AGENTS = {"implementer"}
    phase1_roster = [(aid, label, st) for aid, label, st in roster if aid in PHASE1_AGENTS]
    phase2_roster = [(aid, label, st) for aid, label, st in roster if aid in PHASE2_AGENTS]

    event_q: queue.Queue[dict | None] = queue.Queue()
    agent_results: dict[str, AgentResult] = {}
    results_lock = threading.Lock()

    def _run_agent(agent_id: str, label: str, sub_task: str):
        agent_cls = AGENT_CLASSES.get(agent_id)
        if not agent_cls:
            event_q.put(_event(task_id, "system", "error", f"Unknown agent: {agent_id}"))
            return

        agent = agent_cls(model_remote, task_id=task_id, instance_label=label)
        event_q.put(_event(task_id, label, "thought", f"Starting: {sub_task[:300]}{'...' if len(sub_task) > 300 else ''}"))

        try:
            gen = agent.run(sub_task)
            result = None
            try:
                while True:
                    ev = next(gen)
                    event_q.put(_event(task_id, ev.agent_name, ev.event_type, ev.message, ev.meta or None))
            except StopIteration as stop:
                result = stop.value

            if result:
                with results_lock:
                    agent_results[label] = result
                if agent_id == "research-director" and result.answer:
                    _save_direction(task_id, result.answer)
        except CancelledError:
            event_q.put(_event(task_id, label, "error", "Cancelled by user"))
        except Exception as exc:
            event_q.put(_event(task_id, label, "error", f"Agent failed: {exc}"))

    # ── Phase 1: Run collectors first ─────────────────────────────────────
    if phase1_roster:
        labels1 = [label for _, label, _ in phase1_roster]
        yield _event(task_id, "system", "action", f"Phase 1 — Research: {', '.join(labels1)}")
        threads = []
        for agent_id, label, sub_task in phase1_roster:
            t = threading.Thread(target=_run_agent, args=(agent_id, label, sub_task), daemon=True)
            threads.append(t)
            t.start()
        while any(t.is_alive() for t in threads) or not event_q.empty():
            try:
                ev = event_q.get(timeout=0.15)
                yield ev
                if ev.get("type") == "error" and "Cancelled by user" in ev.get("message", ""):
                    db.update_task(task_id, {"status": "cancelled"})
                    while not event_q.empty():
                        yield event_q.get()
                    return db.get_task(task_id) or {}
            except queue.Empty:
                continue
        while not event_q.empty():
            yield event_q.get()

    # Research context for implementer (so it does not call URLs first)
    collector_summary = ""
    if phase1_roster and agent_results:
        parts = [f"## {label}\n{result.answer}" for label, result in agent_results.items()]
        collector_summary = "\n\n".join(parts)

    # ── Phase 2: Implementer with research context; must use modal_sandbox ──
    if phase2_roster:
        impl_instruction = (
            "Use the research context below. Do NOT call fetch_url or web_search first — "
            "repo URLs and info are already in the context. "
            "Your first step MUST be modal_sandbox: git clone the repo(s) mentioned above, install deps, and run the code."
        )
        if collector_summary:
            impl_instruction = (
                "## Research from Paper Collector / Research Director (use this; do not re-fetch):\n\n"
                + collector_summary[:12000]
                + "\n\n---\n\n"
                + impl_instruction
            )
        else:
            impl_instruction = impl_instruction + f"\n\nUser request: {query[:500]}"

        # Give implementer the context-aware task
        phase2_with_task = []
        for agent_id, label, _ in phase2_roster:
            phase2_with_task.append((agent_id, label, impl_instruction if agent_id == "implementer" else query))

        labels2 = [label for _, label, _ in phase2_with_task]
        yield _event(task_id, "system", "action", f"Phase 2 — Implementation: {', '.join(labels2)} (using research above)")
        threads = []
        for agent_id, label, sub_task in phase2_with_task:
            t = threading.Thread(target=_run_agent, args=(agent_id, label, sub_task), daemon=True)
            threads.append(t)
            t.start()
        while any(t.is_alive() for t in threads) or not event_q.empty():
            try:
                ev = event_q.get(timeout=0.15)
                yield ev
                if ev.get("type") == "error" and "Cancelled by user" in ev.get("message", ""):
                    db.update_task(task_id, {"status": "cancelled"})
                    while not event_q.empty():
                        yield event_q.get()
                    return db.get_task(task_id) or {}
            except queue.Empty:
                continue
        while not event_q.empty():
            yield event_q.get()

    # ── Merge ─────────────────────────────────────────────────────────────
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


# ── Helpers ────────────────────────────────────────────────────────────────


def _get_team_agent_counts(team_id: str | None) -> dict[str, int]:
    """Return {agent_type: instance_count} for the team."""
    if not team_id:
        return {aid: 1 for aid in AGENT_CLASSES}
    team = db.get_team(team_id)
    if not team or not team.get("team_agents"):
        return {aid: 1 for aid in AGENT_CLASSES}
    counts: dict[str, int] = {}
    for ta in team["team_agents"]:
        if ta.get("enabled", True) and ta["agent_type"] in AGENT_CLASSES:
            counts[ta["agent_type"]] = counts.get(ta["agent_type"], 0) + 1
    return counts if counts else {aid: 1 for aid in AGENT_CLASSES}


def _triage(query: str, model_remote: Any, agent_counts: dict[str, int]) -> dict:
    agent_list = "\n".join(
        f"- {aid} (x{count})" for aid, count in agent_counts.items()
    )
    prompt = TRIAGE_SYSTEM_PROMPT + f"\n\nAvailable agents for this team:\n{agent_list}"

    response = model_remote.generate.remote(
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": query},
        ],
        temperature=0.3,
        max_tokens=512,
        enable_thinking=False,
    )
    text = response.get("content", "") or ""
    try:
        start = text.index("{")
        end = text.rindex("}") + 1
        parsed = json.loads(text[start:end])
        return _normalize_triage(parsed, agent_counts)
    except (ValueError, json.JSONDecodeError):
        fallback_id = list(agent_counts.keys())[0]
        return {"agents": {fallback_id: [query]}}


def _normalize_triage(parsed: dict, agent_counts: dict[str, int]) -> dict:
    """Accept both old-style and new-style triage output, normalize to new format.

    New format: {"agents": {"agent-id": ["sub-task-1", ...], ...}}
    Old format: {"agents": ["agent-id", ...], "sub_tasks": {"agent-id": "sub-task"}}
    """
    agents_field = parsed.get("agents", {})

    if isinstance(agents_field, dict):
        result: dict[str, list[str]] = {}
        for aid, tasks in agents_field.items():
            if aid not in agent_counts:
                continue
            if tasks is None:
                tasks = [""]
            elif isinstance(tasks, str):
                tasks = [tasks]
            elif not isinstance(tasks, list):
                tasks = [str(tasks)]
            result[aid] = [t if isinstance(t, str) else str(t) for t in tasks]
        if not result:
            fallback = list(agent_counts.keys())[0]
            result = {fallback: [parsed.get("sub_tasks", {}).get(fallback, "")]}
        return {"agents": result}

    if isinstance(agents_field, list):
        sub_tasks = parsed.get("sub_tasks", {}) or {}
        result = {}
        for aid in agents_field:
            if not isinstance(aid, str) or aid not in agent_counts:
                continue
            st = sub_tasks.get(aid, "")
            if st is None:
                st = ""
            result[aid] = [st] if isinstance(st, str) else [str(s) for s in st]
        if not result:
            fallback = list(agent_counts.keys())[0]
            result = {fallback: [""]}
        return {"agents": result}

    fallback = list(agent_counts.keys())[0]
    return {"agents": {fallback: [""]}}


def _build_roster(
    routing: dict, agent_counts: dict[str, int], query: str
) -> list[tuple[str, str, str]]:
    """Build a list of (agent_id, display_label, sub_task) tuples.

    Uses triage output for sub-tasks when an agent is mentioned; otherwise
    ensures EVERY enabled agent (in agent_counts) runs with the full query,
    so we never run only one agent when the team has multiple.
    """
    roster: list[tuple[str, str, str]] = []
    agents_map = routing.get("agents", {})
    roster_agent_ids = set()

    for agent_id, sub_tasks in agents_map.items():
        if agent_id not in AGENT_CLASSES:
            continue
        if not isinstance(sub_tasks, list):
            sub_tasks = [str(sub_tasks)] if sub_tasks else [query]
        if not sub_tasks:
            sub_tasks = [query]
        count = agent_counts.get(agent_id, 1)
        base_name = AGENT_DEFINITIONS[agent_id]["name"]

        while len(sub_tasks) < count:
            sub_tasks.append(sub_tasks[-1] if sub_tasks else query)
        sub_tasks = sub_tasks[:count]

        for i, st in enumerate(sub_tasks):
            label = f"{base_name} #{i + 1}" if count > 1 else base_name
            roster.append((agent_id, label, st or query))
            roster_agent_ids.add(agent_id)

    # Ensure every enabled agent runs: add any that triage didn't assign
    for agent_id, count in agent_counts.items():
        if count <= 0 or agent_id not in AGENT_CLASSES or agent_id in roster_agent_ids:
            continue
        base_name = AGENT_DEFINITIONS[agent_id]["name"]
        sub_task = query
        if agent_id == "implementer":
            sub_task = (
                f"Using the user request below: find any mentioned repo/codebase (web_search/fetch_url), "
                f"then clone and run it in the sandbox (modal_sandbox). User request: {query[:300]}"
            )
        for i in range(count):
            label = f"{base_name} #{i + 1}" if count > 1 else base_name
            roster.append((agent_id, label, sub_task))
        roster_agent_ids.add(agent_id)

    return roster


def _merge_results(
    original_query: str,
    agent_results: dict[str, AgentResult],
    model_remote: Any,
) -> str:
    if len(agent_results) <= 1:
        return next(iter(agent_results.values())).answer if agent_results else ""

    sections = []
    for label, result in agent_results.items():
        sections.append(f"## {label}\n{result.answer}")

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


def _event(task_id: str, agent: str, event_type: str, message: str, meta: dict | None = None) -> dict:
    ev: dict[str, Any] = {
        "task_id": task_id,
        "agent": agent,
        "type": event_type,
        "message": message,
        "timestamp": time.time(),
    }
    if meta:
        ev["meta"] = meta
    return ev
