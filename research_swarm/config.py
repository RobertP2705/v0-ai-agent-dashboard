# Local vLLM model (best open-weight for tool use on single A100-80GB)
# Qwen2.5-32B-Instruct: 128K context, strong tool/function calling, fits in bf16
MODEL_ID = "Qwen/Qwen2.5-32B-Instruct"
MODEL_REVISION = "main"
GPU_CONFIG = "a100-80gb"
GPU_COUNT = 1
CONTAINER_IDLE_TIMEOUT = 900
MAX_CONCURRENT_INPUTS = 50
MAX_MODEL_LEN = 32768
TEMPERATURE = 0.7
MAX_TOKENS = 4096

AGENT_DEFINITIONS = {
    "paper-collector": {
        "name": "Paper Collector",
        "description": "Scours the web, Reddit, Twitter/X, Hacker News, arXiv, and Semantic Scholar for papers, discussions, blog posts, and resources on any topic.",
        "tools": ["web_search", "fetch_url", "arxiv_search", "semantic_scholar_search"],
    },
    "implementer": {
        "name": "Implementer",
        "description": "Reproduces paper methods in code, runs experiments in Modal sandboxes, logs to W&B, and pushes to GitHub.",
        "tools": ["modal_sandbox", "wandb_log", "github_push"],
    },
    "research-director": {
        "name": "Research Director",
        "description": "Identifies promising research directions based on paper analysis and implementation results.",
        "tools": ["web_search", "fetch_url", "arxiv_search"],
    },
}

TRIAGE_SYSTEM_PROMPT = """\
You are a research task router. Given a user query and a team configuration, \
decide which specialist agents should handle it.

Agent descriptions:
- paper-collector: scours the web (Reddit, Twitter/X, Hacker News, blogs), arXiv, and Semantic Scholar for papers, discussions, tutorials, code repos, and any resources related to the query. Can also fetch and read full page content from URLs.
- implementer: writes code to reproduce paper methods, runs experiments in sandboxes, logs to W&B, pushes to GitHub
- research-director: identifies promising research directions, performs gap analysis, assesses novelty and feasibility

Some agent types may have multiple instances (shown as "x2", "x3" etc.). \
When multiple instances are available, provide a SEPARATE sub-task for each \
instance so they can work in parallel on different angles.

Respond ONLY with a JSON object in this format:
{"agents": {"<agent-id>": ["sub-task-1", "sub-task-2-if-multiple-instances"], ...}}

Examples:
- If paper-collector x2: {"agents": {"paper-collector": ["search arxiv and semantic scholar for the paper", "search Reddit, HN, Twitter, and blogs for community discussion"]}}
- If paper-collector x1: {"agents": {"paper-collector": ["find all resources about the topic"]}}

You may assign more than one agent type if the query spans multiple domains. \
Each sub-task should be focused and non-overlapping. \
Respond with ONLY the JSON, no other text.\
"""
