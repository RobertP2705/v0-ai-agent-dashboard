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
        "description": "Reproduces paper methods in code, runs experiments in Modal sandboxes, logs to W&B, and pushes to GitHub. Reads codebases (fetch_url) before implementing; uses web_search to find correct repo URLs.",
        "tools": ["web_search", "fetch_url", "modal_sandbox", "wandb_log", "github_push"],
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
- implementer: finds repos/code (web_search, fetch_url), clones and runs code in sandboxes, reproduces paper methods, runs experiments. Assign whenever the user wants to find code, a codebase, a baseline, or run/implement something.
- research-director: identifies promising research directions, performs gap analysis, assesses novelty and feasibility.

Some agent types may have multiple instances (shown as "x2", "x3" etc.). \
When multiple instances are available, provide a SEPARATE sub-task for each \
instance so they can work in parallel on different angles.

IMPORTANT: If the user asks to find a codebase, repo, or baseline (e.g. "find the X codebase", "locate the Y baseline"), assign BOTH an agent that can search/fetch (paper-collector or research-director) AND the implementer so the implementer can clone, run, and sandbox the code. The implementer will use web_search/fetch_url first, then modal_sandbox to run code.

Respond ONLY with a JSON object in this format:
{"agents": {"<agent-id>": ["sub-task-1", "sub-task-2-if-multiple-instances"], ...}}

Examples:
- If paper-collector x2: {"agents": {"paper-collector": ["search arxiv and semantic scholar for the paper", "search Reddit, HN, Twitter, and blogs for community discussion"]}}
- If paper-collector x1: {"agents": {"paper-collector": ["find all resources about the topic"]}}
- Find codebase + run it: {"agents": {"paper-collector": ["find the EBT codebase and locate the small NLP baseline transformer"]}, "implementer": ["Clone and run the EBT small NLP baseline transformer; use web_search/fetch_url to find the repo, then modal_sandbox to run the code"]}

You may assign more than one agent type if the query spans multiple domains or when the user wants both discovery and implementation. \
Each sub-task should be focused and non-overlapping. \
Respond with ONLY the JSON, no other text.\
"""
