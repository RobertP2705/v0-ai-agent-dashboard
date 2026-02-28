"""
vLLM inference server for Qwen3-32B on Modal.

Deploys as a Modal class with an A100-80GB GPU, exposes a chat-completion
generate method that the agent layer calls.  Auto-scales to zero when idle.
"""

from __future__ import annotations

import modal

from .config import (
    MODEL_ID,
    GPU_CONFIG,
    GPU_COUNT,
    CONTAINER_IDLE_TIMEOUT,
    MAX_CONCURRENT_INPUTS,
    MAX_MODEL_LEN,
)

app = modal.App("research-swarm")

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
    """Serves Qwen3-32B via vLLM with chat completions."""

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

        if not enable_thinking:
            generated_text = _strip_think_tags(generated_text)

        tool_calls = _extract_tool_calls(generated_text)

        prompt_toks = len(result.prompt_token_ids) if result.prompt_token_ids else 0
        completion_toks = len(result.outputs[0].token_ids) if result.outputs[0].token_ids else 0

        return {
            "content": generated_text if not tool_calls else None,
            "tool_calls": tool_calls,
            "usage": {
                "prompt_tokens": prompt_toks,
                "completion_tokens": completion_toks,
                "total_tokens": prompt_toks + completion_toks,
            },
        }


def _strip_think_tags(text: str) -> str:
    """Remove any <think>...</think> blocks the model emits even with thinking disabled."""
    import re
    return re.sub(r"<think>.*?</think>\s*", "", text, flags=re.DOTALL).strip()


def _extract_tool_calls(text: str) -> list[dict] | None:
    """Parse tool-call blocks from model output.

    Qwen3 emits tool calls as:
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
