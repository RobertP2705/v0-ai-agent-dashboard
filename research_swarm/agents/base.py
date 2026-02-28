"""Base agent with a tool-use loop driven by the shared vLLM endpoint.

Every event is persisted to Supabase via db.insert_event().
"""

from __future__ import annotations

import json
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
        messages: list[dict] = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": task},
        ]
        tool_schemas = self._build_tool_schemas()

        yield self._emit("thought", f"Starting task: {task}")

        for iteration in range(self.max_iterations):
            self._check_cancelled()

            response = self.model.generate.remote(
                messages=messages,
                tools=tool_schemas if tool_schemas else None,
                enable_thinking=False,
            )
            self._accumulate_usage(response.get("usage", {}))

            tool_calls = response.get("tool_calls")
            content = response.get("content")

            if not tool_calls:
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
