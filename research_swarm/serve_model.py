"""
Local vLLM inference for research swarm on Modal.

Uses Qwen2.5-32B-Instruct (config.MODEL_ID): best open-weight for tool use
on a single A100-80GB — 128K context, strong function calling.
"""

from __future__ import annotations

import modal

from .config import (
    CONTAINER_IDLE_TIMEOUT,
    MAX_MODEL_LEN,
    MODEL_ID,
)

app = modal.App("research-swarm")

# ── Local vLLM (Qwen2.5-32B or other HuggingFace model) ──────────────────────

def _download_model():
    from huggingface_hub import snapshot_download

    snapshot_download(
        MODEL_ID,
        ignore_patterns=["*.pth"],
    )

vllm_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "vllm>=0.8.5",
        "transformers>=4.51.0",
        "hf_transfer",
        "huggingface_hub",
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
    .run_function(
        _download_model,
        secrets=[modal.Secret.from_name("huggingface-secret")],
    )
)


@app.cls(
    gpu="A100-80GB",
    image=vllm_image,
    secrets=[modal.Secret.from_name("huggingface-secret")],
    scaledown_window=CONTAINER_IDLE_TIMEOUT,
    timeout=1800,
    min_containers=1,
)
class Qwen3Model:
    """Serves MODEL_ID (e.g. Qwen2.5-32B-Instruct) via vLLM with chat + tool calling."""

    @modal.enter()
    def load_model(self):
        from vllm import LLM, SamplingParams

        self.llm = LLM(
            model=MODEL_ID,
            max_model_len=MAX_MODEL_LEN,
            dtype="auto",
            enforce_eager=True,
        )
        self.default_params = SamplingParams

        warmup = [{"role": "user", "content": "ping"}]
        self.llm.chat(warmup, sampling_params=SamplingParams(max_tokens=1))
        print("Model loaded and warm.")

    @modal.method()
    def generate(
        self,
        messages: list[dict],
        temperature: float = 0.7,
        max_tokens: int = 4096,
        tools: list[dict] | None = None,
        enable_thinking: bool = False,
    ) -> dict:
        """Run chat completion. Returns {"content": str, "tool_calls": list | None, "usage": dict}."""
        from vllm import SamplingParams

        params = SamplingParams(
            temperature=temperature,
            max_tokens=max_tokens,
        )

        chat_kwargs: dict = dict(
            messages=messages,
            sampling_params=params,
            chat_template_kwargs={"enable_thinking": enable_thinking},
        )
        if tools:
            chat_kwargs["tools"] = tools

        try:
            outputs = self.llm.chat(**chat_kwargs)
        except Exception as e:
            # Re-raise as a plain exception so Modal can serialize it without requiring
            # the vllm module on the client (avoids "Deserialization failed" when client has no vllm).
            # Preserve the original error type name and message for debugging.
            raise RuntimeError(
                f"Model inference failed: {type(e).__name__}: {e}"
            ) from None

        if not outputs or not outputs[0].outputs:
            return {"content": "", "tool_calls": None, "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}

        result = outputs[0]
        generated_text = result.outputs[0].text.strip()

        # Extract tool_calls from full text first (they may appear inside or outside <think>)
        tool_calls = _extract_tool_calls(generated_text)

        thinking_text: str | None = None
        if enable_thinking:
            thinking_text = _extract_think_content(generated_text)
        generated_text = _strip_think_tags(generated_text)

        prompt_toks = len(result.prompt_token_ids) if result.prompt_token_ids else 0
        completion_toks = len(result.outputs[0].token_ids) if result.outputs[0].token_ids else 0

        out: dict = {
            "content": generated_text if not tool_calls else (generated_text or None),
            "tool_calls": tool_calls,
            "usage": {
                "prompt_tokens": prompt_toks,
                "completion_tokens": completion_toks,
                "total_tokens": prompt_toks + completion_toks,
            },
        }
        if thinking_text:
            out["thinking"] = thinking_text
        # Debug: so agent can emit visibility when no tool calls
        raw_before_strip = result.outputs[0].text.strip()
        debug_info = {
            "content_len": len(generated_text),
            "thinking_len": len(thinking_text or ""),
            "tool_count": len(tool_calls) if tool_calls else 0,
        }
        # When tools were requested but none found, expose a short raw preview to see if model did CoT or nothing
        if tools and not tool_calls and raw_before_strip:
            debug_info["raw_preview"] = raw_before_strip[:500].replace("\n", " ")
        out["_debug"] = debug_info
        return out


def _extract_think_content(text: str) -> str | None:
    """Extract <think>...</think> block for chain-of-thought; return None if absent."""
    import re
    m = re.search(r"<think>(.*?)</think>", text, re.DOTALL)
    return m.group(1).strip() if m else None


def _strip_think_tags(text: str) -> str:
    """Remove any <think>...</think> blocks so only the actionable content remains."""
    import re
    return re.sub(r"<think>.*?</think>\s*", "", text, flags=re.DOTALL).strip()


def _normalize_tool_call(parsed: dict, raw_key: str = "") -> dict:
    """Build one entry for our tool_calls list from parsed {name, arguments}."""
    import json

    name = parsed.get("name") or parsed.get("function", {}).get("name")
    args = parsed.get("arguments")
    if isinstance(args, dict):
        args = json.dumps(args)
    elif args is None:
        args = parsed.get("function", {}).get("arguments", "{}")
    if not name:
        raise KeyError("name")
    return {
        "id": f"call_{hash(raw_key or name) & 0xFFFFFFFF:08x}",
        "function": {"name": name, "arguments": args if isinstance(args, str) else json.dumps(args or {})},
    }


def _extract_tool_calls(text: str) -> list[dict] | None:
    """Parse tool-call blocks from model output.

    Supports:
    - Qwen: <tool_call>{"name": "...", "arguments": {...}}</tool_call>
    - Raw JSON array: [{"name": "...", "arguments": {...}}, ...]
    - Markdown: ```json {...} ``` or ``` {...} ```
    - Single JSON object with "name" and "arguments" anywhere in text
    """
    import json
    import re

    calls: list[dict] = []

    def try_append(parsed: dict, raw: str = "") -> bool:
        try:
            calls.append(_normalize_tool_call(parsed, raw))
            return True
        except (KeyError, TypeError):
            return False

    # 1) <tool_call>...</tool_call> (Qwen style)
    pattern = re.compile(r"<tool_call>(.*?)</tool_call>", re.DOTALL)
    for raw in pattern.findall(text):
        s = raw.strip()
        start = s.find("{")
        if start == -1:
            continue
        depth, end = 0, -1
        for i in range(start, len(s)):
            if s[i] == "{":
                depth += 1
            elif s[i] == "}":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        if end != -1:
            try:
                try_append(json.loads(s[start:end]), raw)
            except json.JSONDecodeError:
                pass

    if calls:
        return calls

    # 2) Whole text as JSON array [{"name", "arguments"}, ...]
    stripped = text.strip()
    if stripped.startswith("["):
        try:
            arr = json.loads(stripped)
            if isinstance(arr, list):
                for i, item in enumerate(arr):
                    if isinstance(item, dict):
                        try_append(item, f"{i}")
                if calls:
                    return calls
        except json.JSONDecodeError:
            pass

    # 3) ```json ... ``` or ``` ... ``` block
    for block_pattern in [r"```json\s*(.*?)\s*```", r"```\s*(.*?)\s*```"]:
        for raw in re.findall(block_pattern, text, re.DOTALL):
            s = raw.strip()
            start = s.find("{")
            if start == -1:
                continue
            depth, end = 0, -1
            for i in range(start, len(s)):
                if s[i] == "{":
                    depth += 1
                elif s[i] == "}":
                    depth -= 1
                    if depth == 0:
                        end = i + 1
                        break
            if end != -1:
                try:
                    parsed = json.loads(s[start:end])
                    if isinstance(parsed, list):
                        for i, item in enumerate(parsed):
                            if isinstance(item, dict):
                                try_append(item, f"b{i}")
                    elif isinstance(parsed, dict):
                        try_append(parsed, "b")
                    if calls:
                        return calls
                except json.JSONDecodeError:
                    pass

    # 4) Single top-level {...} with "name" and "arguments" (no tags)
    start = text.find("{")
    while start != -1:
        depth, end = 0, -1
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        if end != -1:
            try:
                parsed = json.loads(text[start:end])
                if isinstance(parsed, dict) and parsed.get("name") and ("arguments" in parsed or "args" in parsed):
                    if "arguments" not in parsed:
                        parsed["arguments"] = parsed.get("args", {})
                    try_append(parsed, text[start:end])
            except json.JSONDecodeError:
                pass
        start = text.find("{", start + 1)

    return calls or None
