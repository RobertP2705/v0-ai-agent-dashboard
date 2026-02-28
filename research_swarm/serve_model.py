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

        outputs = self.llm.chat(**chat_kwargs)
        if not outputs or not outputs[0].outputs:
            return {"content": "", "tool_calls": None, "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}

        result = outputs[0]
        generated_text = result.outputs[0].text.strip()

        thinking_text: str | None = None
        if enable_thinking:
            thinking_text = _extract_think_content(generated_text)
            generated_text = _strip_think_tags(generated_text)
        else:
            generated_text = _strip_think_tags(generated_text)

        tool_calls = _extract_tool_calls(generated_text)

        prompt_toks = len(result.prompt_token_ids) if result.prompt_token_ids else 0
        completion_toks = len(result.outputs[0].token_ids) if result.outputs[0].token_ids else 0

        out: dict = {
            "content": generated_text if not tool_calls else None,
            "tool_calls": tool_calls,
            "usage": {
                "prompt_tokens": prompt_toks,
                "completion_tokens": completion_toks,
                "total_tokens": prompt_toks + completion_toks,
            },
        }
        if thinking_text:
            out["thinking"] = thinking_text
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


def _extract_tool_calls(text: str) -> list[dict] | None:
    """Parse tool-call blocks from model output.

    Qwen2.5 / Qwen3 emit tool calls as:
      <tool_call>{"name": "...", "arguments": {...}}</tool_call>
    """
    import json
    import re

    pattern = re.compile(r"<tool_call>(.*?)</tool_call>", re.DOTALL)
    matches = pattern.findall(text)
    if not matches:
        return None

    calls = []
    for raw in matches:
        try:
            parsed = json.loads(raw.strip())
            calls.append(
                {
                    "id": f"call_{hash(raw) & 0xFFFFFFFF:08x}",
                    "function": {
                        "name": parsed["name"],
                        "arguments": json.dumps(parsed.get("arguments", {})),
                    },
                }
            )
        except (json.JSONDecodeError, KeyError):
            continue

    return calls or None
