# Best Use of Modal — AI Inference

## What We Built

An **AI research swarm** — a multi-agent system where specialized AI agents (Paper Collector, Implementer, Research Director) collaborate in real time to research any topic, find papers, reproduce code, and synthesize reports. The entire AI backend runs on Modal.

## How We Use Modal

### 1. Self-Hosted LLM Inference (vLLM on A100-80GB)

We serve **Qwen2.5-32B-Instruct** via vLLM on a Modal A100-80GB GPU — no API keys to OpenAI, no rate limits, no per-token billing from third parties. The model handles:

- **Task triage**: Routing user queries to the right agents
- **Tool-calling loops**: Each agent runs a multi-turn tool-use loop (prompt → model → tool calls → model → … → final answer) powered by the same vLLM endpoint
- **Chain-of-thought reasoning**: `enable_thinking=True` extracts `<think>` blocks for visible agent reasoning
- **Result synthesis**: Merging outputs from multiple agents into a coherent research report

```python
# research_swarm/serve_model.py
@app.cls(
    gpu="A100-80GB",
    image=vllm_image,
    secrets=[modal.Secret.from_name("huggingface-secret")],
    scaledown_window=CONTAINER_IDLE_TIMEOUT,
    timeout=1800,
    min_containers=1,
)
class Qwen3Model:
    @modal.enter()
    def load_model(self):
        self.llm = LLM(model=MODEL_ID, max_model_len=MAX_MODEL_LEN, dtype="auto", enforce_eager=True)
        # Warm up to eliminate first-request latency
        self.llm.chat([{"role": "user", "content": "ping"}], sampling_params=SamplingParams(max_tokens=1))

    @modal.method()
    def generate(self, messages, temperature=0.7, max_tokens=4096, tools=None, enable_thinking=False) -> dict:
        # Full chat completion with tool-call extraction, thinking block parsing, usage tracking
        ...
```

**Why this matters**: We're running a 32-billion-parameter model with 128K context on our own GPU, with full control over sampling, tool schemas, and response parsing. No API vendor lock-in. The model image is pre-built with HuggingFace model weights baked in via `snapshot_download`, so cold starts are fast.

### 2. Ephemeral Sandboxes for Code Execution

The **Implementer** agent doesn't just find papers — it *reproduces* them. When the agent needs to run code, it spins up a **Modal Sandbox**: an isolated container with git, pip, and optional GPU access.

```python
# research_swarm/tools/modal_sandbox.py
def modal_sandbox(code, requirements=None, setup_commands=None, gpu=None, timeout=600):
    image = (
        modal.Image.debian_slim(python_version="3.11")
        .run_commands("apt-get update && apt-get install -y --no-install-recommends git")
        .pip_install(*requirements, "wandb")
    )
    sb = modal.Sandbox.create(app=app_ref, image=image, timeout=timeout, gpu=gpu, ...)

    # Run setup commands (apt installs, git clone, etc.)
    for cmd in setup_commands:
        sb.exec("bash", "-c", cmd)

    # Write and execute the experiment
    sb.exec("bash", "-c", f"cat > /root/experiment.py << 'PYEOF'\n{code}\nPYEOF")
    proc = sb.exec("python", "/root/experiment.py", timeout=timeout)
    return {"stdout": proc.stdout.read(), "stderr": proc.stderr.read(), "exit_code": proc.returncode}
```

Each sandbox:
- Gets a fresh container with custom pip dependencies
- Can request GPU (T4, A10G, A100) for ML workloads
- Has `WANDB_API_KEY` and `GITHUB_TOKEN` injected via Modal Secrets
- Auto-terminates after execution — zero lingering resources
- Returns stdout/stderr/exit_code back to the agent loop, which retries on failure

### 3. FastAPI Backend as a Modal ASGI App

The entire API (teams CRUD, research streaming, task management, paper/experiment queries) is a FastAPI app deployed as a Modal function:

```python
# research_swarm/api.py
@modal_app.function(
    image=modal.Image.debian_slim(python_version="3.11").pip_install(...),
    secrets=[
        modal.Secret.from_name("huggingface-secret"),
        modal.Secret.from_name("search-api-keys"),
        modal.Secret.from_name("supabase-secret"),
    ],
    timeout=1800,
    allow_concurrent_inputs=100,
)
@modal.asgi_app()
def api():
    return web_app
```

This gives us:
- **100 concurrent research sessions** on a single container
- **SSE streaming** — the orchestrator yields events as they happen, streamed through FastAPI → Next.js → browser in real time
- **Secret management** — HuggingFace, Tavily, Supabase, W&B, and GitHub credentials all injected securely via Modal Secrets

### 4. Two-Phase Parallel Agent Execution

The orchestrator runs agents in **parallel threads**, all hitting the same Modal-hosted vLLM endpoint:

```
Phase 1 (Research):   Paper Collector ×2 + Research Director  → run in parallel
Phase 2 (Implementation): Implementer                        → runs with Phase 1 context
Merge:                Single LLM call to synthesize everything
```

Each agent independently calls `model.generate.remote()` — Modal handles the RPC, serialization, and GPU scheduling. The `max_concurrent_inputs=50` on the model class means multiple agents can generate simultaneously without blocking.

### 5. Real-Time Agent Status Tracking

The API tracks which agents are actively running across sessions, so the frontend can show live idle/busy/error states on agent cards:

```python
_active_sessions: dict[str, set[str]] = {}  # session_key → {agent_ids}

# During research, track active agents from stream events
agent_name = event.get("agent", "")
with _sessions_lock:
    _active_sessions[session_key].add(agent_id)
```

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│  Next.js Frontend (Vercel)                                      │
│  ├── Research Console (SSE streaming)                           │
│  ├── Agent Status Grid (real-time busy/idle)                    │
│  ├── Knowledge Graph (force-directed visualization)             │
│  └── Team Management (agent scaling)                            │
└──────────────────────┬──────────────────────────────────────────┘
                       │ POST /research/stream (SSE)
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  Modal: FastAPI ASGI App                                        │
│  ├── Triage (LLM call → route to agents)                       │
│  ├── Agent Loop × N (parallel threads)                          │
│  │   ├── model.generate.remote() → Qwen2.5-32B (vLLM, A100)   │
│  │   ├── Tool calls: web_search, arxiv, semantic_scholar, ...   │
│  │   └── modal_sandbox() → Ephemeral container (optional GPU)   │
│  └── Merge (LLM call → synthesized report)                      │
├─────────────────────────────────────────────────────────────────┤
│  Modal: Qwen3Model (vLLM on A100-80GB)                         │
│  └── Chat completion + tool calling + chain-of-thought          │
├─────────────────────────────────────────────────────────────────┤
│  Modal: Sandboxes (ephemeral, per-execution)                    │
│  └── git clone → pip install → run experiment → return results  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Numbers

| Metric | Value |
|--------|-------|
| Model | Qwen2.5-32B-Instruct (32B params, 128K context) |
| GPU | A100-80GB (single GPU, bf16) |
| Max concurrent inputs | 50 (model) / 100 (API) |
| Agent types | 3 (Paper Collector, Implementer, Research Director) |
| Tools | 7 (web_search, fetch_url, arxiv_search, semantic_scholar, modal_sandbox, wandb_log, github_push) |
| Sandbox timeout | 600s default, configurable per-call |
| Sandbox GPU options | T4, A10G, A100 (on-demand) |
| Modal Secrets used | 3 (huggingface, search-api-keys, supabase) |

## Why Modal Was Essential

1. **GPU inference without ops**: Serving a 32B model with vLLM would normally require provisioning GPU instances, managing CUDA drivers, handling cold starts. Modal makes this a decorator.
2. **Ephemeral sandboxes**: The Implementer agent needs to git clone, pip install, and run arbitrary code safely. Modal Sandboxes provide perfect isolation with per-execution container lifecycle.
3. **Secret injection**: Six API keys across three secret groups, securely injected without env file management.
4. **Concurrent agent execution**: Multiple agents call the model endpoint simultaneously — Modal's infrastructure handles the GPU memory management and request queuing.
5. **Zero infrastructure management**: No Kubernetes, no Docker Compose, no GPU cloud accounts. `modal deploy research_swarm` and it's live.
