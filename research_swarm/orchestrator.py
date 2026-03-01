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


def _agent_result_from_resume(label: str, data: dict) -> AgentResult:
    """Build AgentResult from resume_context entry."""
    return AgentResult(
        agent_id=data.get("agent_id", ""),
        agent_name=label,
        answer=data.get("answer", "") or "",
        events=[],
        usage=data.get("usage") or {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    )


def run_research(
    query: str,
    model_remote: Any,
    team_id: str | None = None,
    project_id: str | None = None,
    memory_context: list[dict] | None = None,
    existing_task_id: str | None = None,
) -> Generator[dict, None, dict]:
    """Full orchestration pipeline: triage -> parallel fan-out -> merge.

    Yields event dicts as they happen for SSE streaming.
    All state is persisted to Supabase.

    If existing_task_id is set, uses that task (loads query/team_id/project_id from DB).
    If the task has resume_phase >= 1 and resume_context, resumes from that phase.
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

    task_id: str
    resume_phase: int = 0
    resume_context: dict | None = None

    if existing_task_id:
        task_row = db.get_task(existing_task_id)
        if not task_row:
            yield _event("none", "system", "error", f"Task not found: {existing_task_id}")
            return {}
        task_id = task_row["id"]
        query = task_row.get("query") or query
        team_id = task_row.get("team_id") or team_id
        project_id = task_row.get("project_id") or project_id
        resume_phase = int(task_row.get("resume_phase") or 0)
        rc = task_row.get("resume_context")
        resume_context = rc if isinstance(rc, dict) else None
    else:
        try:
            task_row = db.create_task(query=query, team_id=team_id, project_id=project_id)
        except Exception as exc:
            yield _event("none", "system", "error",
                        f"Database error creating task: {exc}")
            return {}
        task_id = task_row["id"]

    db.update_task(task_id, {"status": "triaging"})
    yield _event(task_id, "system", "thought", f"Received query: {query}")

    agent_counts = _get_team_agent_counts(team_id)

    if not agent_counts:
        yield _event(task_id, "system", "error",
                      "No agents are enabled for this team. Add agents in the team editor.")
        db.update_task(task_id, {"status": "error"})
        return db.get_task(task_id) or {}

    PHASE1_AGENTS = {"paper-collector", "research-director"}
    PHASE2_AGENTS = {"implementer", "pdf-agent"}
    event_q: queue.Queue[dict | None] = queue.Queue()
    agent_results: dict[str, AgentResult] = {}
    results_lock = threading.Lock()
    roster: list[tuple[str, str, str]] = []
    phase1_roster: list[tuple[str, str, str]] = []
    phase2_roster: list[tuple[str, str, str]] = []

    has_checkpoint = (
        resume_context
        and (resume_context.get("phase1_roster") or resume_context.get("phase2_roster"))
    )
    if resume_phase >= 0 and has_checkpoint:
        # Resume from checkpoint: restore roster and optionally agent_results; skip triage (and phases we've already completed)
        yield _event(task_id, "system", "action", f"Resuming from checkpoint (phase {resume_phase + 1})...")
        phase1_roster = [tuple(x) for x in resume_context.get("phase1_roster") or []]
        phase2_roster = [tuple(x) for x in resume_context.get("phase2_roster") or []]
        phase1_roster = [(r[0], r[1], "") for r in phase1_roster if len(r) >= 2]
        phase2_roster = [(r[0], r[1], "") for r in phase2_roster if len(r) >= 2]
        if resume_phase >= 1:
            ar_data = resume_context.get("agent_results") or {}
            for label, data in ar_data.items():
                if isinstance(data, dict):
                    agent_results[label] = _agent_result_from_resume(label, data)
        all_agent_ids = list({aid for aid, _, _ in phase1_roster + phase2_roster})
        db.update_task(task_id, {"status": "running", "assigned_agents": all_agent_ids or list(agent_counts.keys())})
    else:
        counts_str = ", ".join(f"{a} x{c}" for a, c in agent_counts.items())
        yield _event(task_id, "system", "action", f"Routing query to model ({counts_str})...")

        try:
            routing = _triage(augmented_query, model_remote, agent_counts)
        except Exception as exc:
            msg = str(exc)
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
        db.update_task(task_id, {"status": "running", "assigned_agents": all_agent_ids})
        phase1_roster = [(aid, label, st) for aid, label, st in roster if aid in PHASE1_AGENTS]
        phase2_roster = [(aid, label, st) for aid, label, st in roster if aid in PHASE2_AGENTS]
        # Require PDF agent in Phase 2 when the team has it (so reports are always produced)
        if agent_counts.get("pdf-agent", 0) > 0 and not any(aid == "pdf-agent" for aid, _, _ in phase2_roster):
            base_name = AGENT_DEFINITIONS["pdf-agent"]["name"]
            for i in range(agent_counts["pdf-agent"]):
                label = f"{base_name} #{i + 1}" if agent_counts["pdf-agent"] > 1 else base_name
                phase2_roster.append(("pdf-agent", label, query))

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
                    _save_direction(task_id, result.answer, title_prefix="Research direction")
                if agent_id == "implementer" and result.answer:
                    _save_direction(task_id, result.answer, title_prefix="Implementer / Sandbox result")
        except CancelledError:
            event_q.put(_event(task_id, label, "error", "Cancelled by user"))
        except Exception as exc:
            event_q.put(_event(task_id, label, "error", f"Agent failed: {exc}"))

    # ── Phase 1: Run collectors first (skip when resuming with phase 1+ already done) ───
    if phase1_roster and not (resume_phase >= 1 and resume_context):
        # Checkpoint before Phase 1 so timeout during Phase 1 still lets us resume (skip triage, re-run Phase 1)
        if not (resume_phase >= 0 and resume_context):
            db.update_task(task_id, {
                "resume_phase": 0,
                "resume_context": {
                    "phase1_roster": [[aid, label] for aid, label, _ in phase1_roster],
                    "phase2_roster": [[aid, label] for aid, label, _ in phase2_roster],
                },
            })
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

        # Checkpoint after phase 1 so we can resume after timeout
        collector_parts = [f"## {label}\n{result.answer}" for label, result in agent_results.items()]
        _collector_summary = "\n\n".join(collector_parts)
        resume_payload = {
            "collector_summary": _collector_summary,
            "agent_results": {
                label: {"agent_id": r.agent_id, "answer": r.answer, "usage": r.usage}
                for label, r in agent_results.items()
            },
            "phase1_roster": [[aid, label] for aid, label, _ in phase1_roster],
            "phase2_roster": [[aid, label] for aid, label, _ in phase2_roster],
        }
        db.update_task(task_id, {"resume_phase": 1, "resume_context": resume_payload})

    # Research context for implementer (so it does not call URLs first)
    collector_summary = ""
    if resume_phase >= 1 and resume_context and resume_context.get("collector_summary"):
        collector_summary = resume_context["collector_summary"]
    elif phase1_roster and agent_results:
        parts = [f"## {label}\n{result.answer}" for label, result in agent_results.items()]
        collector_summary = "\n\n".join(parts)

    # ── Phase 2: Implementer and PDF agent with research context (skip when resume_phase >= 2) ──
    if phase2_roster and not (resume_phase >= 2 and resume_context):
        impl_instruction = (
            "Use the research context below. Do NOT call fetch_url or web_search first — "
            "repo URLs and info are already in the context. "
            "Your first step MUST be modal_sandbox: git clone the repo(s) mentioned above (if they exist) (use the EXACT URL(s) from the context — never placeholder URLs like https://github.com/username/repo.git), install deps, and run the code. Use subprocess.run for git clone with capture_output=True and GIT_TERMINAL_PROMPT=0; do not use os.system() for git."
        )
        pdf_instruction = (
            "Use the research context below to produce a short PDF report. Do NOT call web_search or fetch_url first — use the context. "
            "Structure: title, abstract (1–3 sentences), 1–3 short sections. If a chart or figure would help, use modal_sandbox with matplotlib to generate it, then call create_report_pdf with title, abstract, sections, and optional figures. "
            "Keep the report concise (1–2 pages). Include the download URL in your final answer."
        )
        if collector_summary:
            context_block = (
                "## Research from Paper Collector / Research Director (use this; do not re-fetch):\n\n"
                + collector_summary[:12000]
                + "\n\n---\n\n"
            )
            impl_instruction = context_block + impl_instruction
            pdf_instruction = context_block + pdf_instruction + f"\n\nUser request: {query[:500]}"
        else:
            impl_instruction = impl_instruction + f"\n\nUser request: {query[:500]}"
            pdf_instruction = pdf_instruction + f"\n\nUser request: {query[:500]}"

        def _phase2_task(agent_id: str, label: str) -> str:
            if agent_id == "implementer":
                return impl_instruction
            if agent_id == "pdf-agent":
                return pdf_instruction
            return query

        phase2_with_task = []
        for agent_id, label, _ in phase2_roster:
            phase2_with_task.append((agent_id, label, _phase2_task(agent_id, label)))

        # Run implementer(s) first, then PDF agent(s) so the report is produced at the end
        phase2_impl = [(a, l, t) for a, l, t in phase2_with_task if a == "implementer"]
        phase2_pdf = [(a, l, t) for a, l, t in phase2_with_task if a == "pdf-agent"]
        phase2_other = [(a, l, t) for a, l, t in phase2_with_task if a not in ("implementer", "pdf-agent")]
        phase2_ordered = phase2_impl + phase2_other + phase2_pdf

        # Checkpoint at start of Phase 2 so timeout during Phase 2 still resumes here (not from Phase 1)
        resume_payload_before_2 = {
            "collector_summary": collector_summary,
            "agent_results": {
                label: {"agent_id": r.agent_id, "answer": r.answer, "usage": r.usage}
                for label, r in agent_results.items()
            },
            "phase1_roster": [[aid, label] for aid, label, _ in phase1_roster],
            "phase2_roster": [[aid, label] for aid, label, _ in phase2_roster],
        }
        db.update_task(task_id, {"resume_phase": 1, "resume_context": resume_payload_before_2})

        labels2 = [label for _, label, _ in phase2_with_task]
        yield _event(task_id, "system", "action", f"Phase 2 — Implementation: {', '.join(labels2)} (using research above)")
        for agent_id, label, sub_task in phase2_ordered:
            t = threading.Thread(target=_run_agent, args=(agent_id, label, sub_task), daemon=True)
            t.start()
            while t.is_alive() or not event_q.empty():
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

        # Checkpoint after phase 2 for resume
        resume_payload2 = {
            "collector_summary": collector_summary,
            "agent_results": {
                label: {"agent_id": r.agent_id, "answer": r.answer, "usage": r.usage}
                for label, r in agent_results.items()
            },
            "phase1_roster": [[aid, label] for aid, label, _ in phase1_roster],
            "phase2_roster": [[aid, label] for aid, label, _ in phase2_roster],
        }
        db.update_task(task_id, {"resume_phase": 2, "resume_context": resume_payload2})

    # ── Phase 3: Route sandbox stdout back to research-director ─────────
    impl_sandbox_parts = []
    roster_for_impl = roster if roster else phase2_roster
    for label, r in agent_results.items():
        if any(aid == "implementer" and l == label for aid, l, _ in roster_for_impl):
            if r.answer:
                impl_sandbox_parts.append(f"## {label}\n{r.answer}")

    rd_in_roster = any(aid == "research-director" for aid, _, _ in phase1_roster)
    if impl_sandbox_parts and rd_in_roster:
        # Checkpoint at start of Phase 3 so timeout during Phase 3 resumes here (not from Phase 1 or 2)
        resume_payload_before_3 = {
            "collector_summary": collector_summary,
            "agent_results": {
                label: {"agent_id": r.agent_id, "answer": r.answer, "usage": r.usage}
                for label, r in agent_results.items()
            },
            "phase1_roster": [[aid, label] for aid, label, _ in phase1_roster],
            "phase2_roster": [[aid, label] for aid, label, _ in phase2_roster],
        }
        db.update_task(task_id, {"resume_phase": 2, "resume_context": resume_payload_before_3})

        sandbox_context = "\n\n".join(impl_sandbox_parts)[:12000]
        followup_task = (
            "The implementer has finished running sandbox experiments. "
            "Below is the full stdout/stderr output from the sandbox executions.\n\n"
            "Review these results and provide an updated research analysis that incorporates "
            "the execution outcomes — what worked, what failed, key findings from stdout.\n\n"
            + sandbox_context
        )
        yield _event(task_id, "system", "action", "Phase 3 — Research Director reviewing sandbox results")
        rd_threads = []
        for agent_id, label, _ in phase1_roster:
            if agent_id != "research-director":
                continue
            review_label = f"{label} (review)"
            t = threading.Thread(target=_run_agent, args=(agent_id, review_label, followup_task), daemon=True)
            rd_threads.append(t)
            t.start()
        while any(t.is_alive() for t in rd_threads) or not event_q.empty():
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
        "resume_phase": 0,
        "resume_context": None,
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
    return counts


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
        count = agent_counts.get(agent_id, 0)
        if count <= 0:
            continue
        if not isinstance(sub_tasks, list):
            sub_tasks = [str(sub_tasks)] if sub_tasks else [query]
        if not sub_tasks:
            sub_tasks = [query]
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


def _save_direction(task_id: str, answer: str, title_prefix: str = "Research direction"):
    """Extract and persist a research direction or implementer result for the task."""
    try:
        title = answer.split("\n")[0][:200].strip("# ").strip()
        if not title:
            title = title_prefix
        else:
            title = f"{title_prefix}: {title}" if title_prefix != "Research direction" else title
        db.insert_direction(
            task_id=task_id,
            title=title[:200],
            rationale=answer[:4000],
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
