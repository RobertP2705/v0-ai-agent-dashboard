from .web_search import web_search, TOOL_SCHEMA as WEB_SEARCH_SCHEMA
from .arxiv_search import arxiv_search, TOOL_SCHEMA as ARXIV_SEARCH_SCHEMA
from .semantic_scholar import semantic_scholar_search, TOOL_SCHEMA as SEMANTIC_SCHOLAR_SCHEMA
from .fetch_url import fetch_url, TOOL_SCHEMA as FETCH_URL_SCHEMA
from .modal_sandbox import modal_sandbox, TOOL_SCHEMA as MODAL_SANDBOX_SCHEMA
from .wandb_log import wandb_log, TOOL_SCHEMA as WANDB_LOG_SCHEMA
from .github_repo import github_push, TOOL_SCHEMA as GITHUB_PUSH_SCHEMA

TOOL_REGISTRY: dict[str, dict] = {
    "web_search": {"fn": web_search, "schema": WEB_SEARCH_SCHEMA},
    "arxiv_search": {"fn": arxiv_search, "schema": ARXIV_SEARCH_SCHEMA},
    "semantic_scholar_search": {"fn": semantic_scholar_search, "schema": SEMANTIC_SCHOLAR_SCHEMA},
    "fetch_url": {"fn": fetch_url, "schema": FETCH_URL_SCHEMA},
    "modal_sandbox": {"fn": modal_sandbox, "schema": MODAL_SANDBOX_SCHEMA},
    "wandb_log": {"fn": wandb_log, "schema": WANDB_LOG_SCHEMA},
    "github_push": {"fn": github_push, "schema": GITHUB_PUSH_SCHEMA},
}
