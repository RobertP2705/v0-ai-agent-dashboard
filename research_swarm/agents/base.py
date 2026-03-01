"""Base agent with a tool-use loop driven by the shared vLLM endpoint.

Every event is persisted to Supabase via db.insert_event().
"""

from __future__ import annotations

import json
import queue
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Generator

from ..config import AGENT_DEFINITIONS


@dataclass
class AgentEvent:
    agent_id: str
    agent_name: str
    event_type: str  # "thought" | "action" | "result" | "error"
    message: str
    timestamp: float = field(default_factory=time.time)
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentResult:
    agent_id: str
    agent_name: str
    answer: str
    events: list[AgentEvent]
    usage: dict[str, int]


class CancelledError(Exception):
    pass


THINKING_INSTRUCTIONS = """\
Work step-by-step with explicit reasoning (chain-of-thought):
1. Before taking any action, briefly plan the next 1–3 steps and why.
2. After each tool result, reason about what happened and what to do next.
3. When a step fails (error, bad output, wrong result), think through possible causes and fixes or a revised plan before trying again. Do not repeat the same failing step without a concrete change.
"""


class BaseAgent:
    """Agentic loop: prompt -> model -> tool calls -> model -> ... -> final answer."""

    agent_id: str
    system_prompt: str
    tool_names: list[str]
    max_iterations: int = 6

    def __init__(self, agent_id: str, model_remote: Any, task_id: str | None = None, instance_label: str | None = None):
        defn = AGENT_DEFINITIONS[agent_id]
        self.agent_id = agent_id
        self.agent_name = instance_label or defn["name"]
        self.tool_names = defn["tools"]
        self.model = model_remote
        self.task_id = task_id
        self._total_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

    def _check_cancelled(self):
        """Check if this task has been cancelled in the database."""
        if not self.task_id:
            return
        try:
            from .. import db
            task = db.get_task(self.task_id)
            if task and task.get("status") == "cancelled":
                raise CancelledError("Task was cancelled by user")
        except CancelledError:
            raise
        except Exception:
            pass

    def _build_tool_schemas(self) -> list[dict]:
        from ..tools import TOOL_REGISTRY
        return [TOOL_REGISTRY[t]["schema"] for t in self.tool_names if t in TOOL_REGISTRY]

    def _call_tool(self, name: str, arguments: dict) -> str:
        from ..tools import TOOL_REGISTRY
        entry = TOOL_REGISTRY.get(name)
        if not entry:
            return json.dumps({"error": f"Unknown tool: {name}"})
        try:
            result = entry["fn"](**arguments)
            self._persist_tool_results(name, result)
            return json.dumps(result, default=str)
        except Exception as exc:
            return json.dumps({"error": str(exc)})

    def _persist_tool_results(self, tool_name: str, result: Any):
        """Save tool outputs to Supabase tables (papers, experiments, etc.)."""
        if not self.task_id:
            return
        try:
            from .. import db
            if tool_name in ("arxiv_search", "semantic_scholar_search") and isinstance(result, list):
                for paper in result:
                    if not isinstance(paper, dict) or "title" not in paper:
                        continue
                    db.insert_paper(
                        task_id=self.task_id,
                        arxiv_id=paper.get("arxiv_id") or "",
                        title=paper["title"],
                        authors=paper.get("authors") or [],
                        abstract=paper.get("abstract") or "",
                        summary="",
                        pdf_url=paper.get("pdf_url") or "",
                    )
            elif tool_name == "web_search" and isinstance(result, list):
                for item in result:
                    if not isinstance(item, dict) or "error" in item:
                        continue
                    title = item.get("title", "")
                    if not title:
                        continue
                    db.insert_paper(
                        task_id=self.task_id,
                        arxiv_id="",
                        title=title,
                        authors=[],
                        abstract=item.get("snippet", ""),
                        summary="",
                        pdf_url=item.get("url", ""),
                    )
            elif tool_name == "modal_sandbox" and isinstance(result, dict):
                db.insert_experiment(
                    task_id=self.task_id,
                    paper_id=None,
                    code="(see tool call)",
                    status="completed" if result.get("exit_code") == 0 else "failed",
                    metrics={"exit_code": result.get("exit_code")},
                )
        except Exception:
            pass

    def _emit(self, event_type: str, message: str, **meta: Any) -> AgentEvent:
        ev = AgentEvent(
            agent_id=self.agent_id,
            agent_name=self.agent_name,
            event_type=event_type,
            message=message,
            meta=meta,
        )
        if self.task_id:
            self._persist_event(ev)
        return ev

    def _persist_event(self, ev: AgentEvent):
        try:
            from ..db import insert_event
            insert_event(
                task_id=self.task_id,
                agent_type=ev.agent_id,
                event_type=ev.event_type,
                message=ev.message,
                meta=ev.meta,
            )
        except Exception:
            pass

    def run(self, task: str) -> Generator[AgentEvent, None, AgentResult]:
        """Execute the agentic loop, yielding events as they happen."""
        system_content = THINKING_INSTRUCTIONS.strip() + "\n\n" + self.system_prompt
        messages: list[dict] = [
            {"role": "system", "content": system_content},
            {"role": "user", "content": task},
        ]
        tool_schemas = self._build_tool_schemas()
        no_tool_call_nudges = 0  # for implementer: allow several nudges before accepting text-only answer
        last_sandbox_failed = False  # implementer: avoid stopping right after a failed sandbox

        yield self._emit("thought", f"Starting task: {task}")

        for iteration in range(self.max_iterations):
            self._check_cancelled()

            if iteration > 0:
                yield self._emit("thought", "Analyzing results and planning next step...")

            response = self.model.generate.remote(
                messages=messages,
                tools=tool_schemas if tool_schemas else None,
                enable_thinking=True,
            )
            self._accumulate_usage(response.get("usage", {}))

            thinking = response.get("thinking")
            if thinking and isinstance(thinking, str) and thinking.strip():
                yield self._emit("thought", thinking.strip())

            tool_calls = response.get("tool_calls")
            content = response.get("content")
            debug = response.get("_debug") or {}

            if not tool_calls:
                # Visibility: so user can tell if model did CoT but no tools vs empty
                n_content = debug.get("content_len", len(content or ""))
                n_thinking = debug.get("thinking_len", 0)
                if tool_schemas:
                    msg = (
                        f"[Response] No tool calls (content: {n_content} chars, thinking: {n_thinking} chars). "
                        + ("Treating as final answer." if (content or "").strip() else "Empty content — model may have hit token limit or not emitted <tool_call>.")
                    )
                    raw_preview = debug.get("raw_preview")
                    if raw_preview:
                        msg += f" Raw preview: {raw_preview}"
                    yield self._emit("thought", msg)
                # Implementer: nudge after failed sandbox, or to encourage first run, or after success if more scripts may be needed
                is_implementer = self.agent_id == "implementer"
                max_nudges = 5 if is_implementer else 1
                implementer_should_keep_going = is_implementer and (
                    last_sandbox_failed
                    or no_tool_call_nudges < 2
                    or (not last_sandbox_failed and no_tool_call_nudges < 3)  # after success: one more chance to run another script
                )
                should_nudge = (
                    tool_schemas
                    and no_tool_call_nudges < max_nudges
                    and (implementer_should_keep_going or (not is_implementer and not (content or "").strip() and iteration == 0))
                )
                if should_nudge:
                    no_tool_call_nudges += 1
                    if is_implementer and last_sandbox_failed:
                        nudge = (
                            "The last sandbox run failed. Do not stop. You MUST call modal_sandbox again with a fix "
                            "(e.g. dataset_dir, correct requirements, setup_commands, or code change). "
                            "Reply with a <tool_call> for modal_sandbox — do not respond with only text."
                        )
                    elif is_implementer and not last_sandbox_failed and no_tool_call_nudges >= 2:
                        nudge = (
                            "If the task requires running another script or command to complete it, call modal_sandbox again now. "
                            "If you are done, provide your final summary in text."
                        )
                    elif is_implementer:
                        nudge = (
                            "You must use modal_sandbox: clone the repo and run the code. "
                            "Reply with <tool_call>{\"name\": \"modal_sandbox\", \"arguments\": {\"code\": \"...\", \"requirements\": [...]}}</tool_call>."
                        )
                    else:
                        nudge = "You have access to tools (e.g. web_search, fetch_url, modal_sandbox). Use at least one tool. Reply with <tool_call>...</tool_call>."
                    yield self._emit("thought", f"Nudge {no_tool_call_nudges}/{max_nudges}: use tools, do not stop with only text.")
                    messages.append({"role": "user", "content": nudge})
                    continue
                answer = content or ""
                yield self._emit("result", answer)
                return AgentResult(
                    agent_id=self.agent_id,
                    agent_name=self.agent_name,
                    answer=answer,
                    events=[],
                    usage=self._total_usage.copy(),
                )

            messages.append({"role": "assistant", "content": content, "tool_calls": tool_calls})

            if content and content.strip():
                yield self._emit("thought", content.strip())

            for tc in tool_calls:
                self._check_cancelled()
                fn_name = tc["function"]["name"]
                fn_args = json.loads(tc["function"]["arguments"])

                summary = f"Calling {fn_name}({json.dumps(fn_args, default=str)[:120]})"
                meta: dict[str, Any] = {"tool": fn_name, "args": fn_args}
                if fn_name == "modal_sandbox":
                    meta["code"] = fn_args.get("code", "")
                    meta["requirements"] = fn_args.get("requirements", [])
                    summary = f"Running sandbox ({len(meta['code'])} chars)"
                yield self._emit("action", summary, **meta)

                if fn_name == "modal_sandbox":
                    progress_queue = queue.Queue()

                    def run_sandbox():
                        from ..tools.modal_sandbox import modal_sandbox
                        modal_sandbox(progress_queue=progress_queue, **fn_args)

                    t = threading.Thread(target=run_sandbox, daemon=True)
                    t.start()
                    tool_result = json.dumps({"error": "sandbox did not return result", "exit_code": -1})
                    while t.is_alive() or not progress_queue.empty():
                        self._check_cancelled()
                        try:
                            kind, payload = progress_queue.get(timeout=25)
                        except queue.Empty:
                            if t.is_alive():
                                yield self._emit("thought", "Sandbox still running…")
                            continue
                        if kind == "done":
                            tool_result = json.dumps(payload)
                            break
                        preview = (payload[:350] + "…") if len(payload) > 350 else payload
                        preview = preview.replace("\n", " ").strip()
                        yield self._emit("thought", f"Sandbox {kind}: {preview}")
                else:
                    tool_result = self._call_tool(fn_name, fn_args)
                result_meta: dict[str, Any] = {"tool": fn_name, "chars": len(tool_result)}
                try:
                    parsed = json.loads(tool_result)
                    if fn_name == "modal_sandbox" and isinstance(parsed, dict):
                        result_meta["exit_code"] = parsed.get("exit_code")
                        result_meta["stdout"] = parsed.get("stdout", "")[:2000]
                        result_meta["stderr"] = parsed.get("stderr", "")[:1000]
                except (json.JSONDecodeError, TypeError):
                    pass
                if fn_name == "modal_sandbox" and "exit_code" in result_meta:
                    ec = result_meta["exit_code"]
                    stdout_text = result_meta.get("stdout", "")
                    stderr_text = result_meta.get("stderr", "")
                    last_sandbox_failed = ec != 0
                    if ec == 0:
                        preview = stdout_text.strip()[:120]
                        msg = f"modal_sandbox returned ({len(tool_result)} chars)"
                        if preview:
                            msg += f" — {preview}{'…' if len(stdout_text.strip()) > 120 else ''}"
                    else:
                        preview = (stderr_text or stdout_text).strip()[:120]
                        msg = f"modal_sandbox failed (exit {ec})"
                        if preview:
                            msg += f" — {preview}{'…' if len((stderr_text or stdout_text).strip()) > 120 else ''}"
                    yield self._emit("result", msg, **result_meta)
                else:
                    yield self._emit("result", f"{fn_name} returned ({len(tool_result)} chars)", **result_meta)

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": tool_result,
                })

        yield self._emit("error", "Max iterations reached without final answer")
        return AgentResult(
            agent_id=self.agent_id,
            agent_name=self.agent_name,
            answer="Max iterations reached.",
            events=[],
            usage=self._total_usage.copy(),
        )

    def _accumulate_usage(self, usage: dict):
        for k in self._total_usage:
            self._total_usage[k] += usage.get(k, 0)
