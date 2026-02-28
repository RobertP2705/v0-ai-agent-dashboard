# Agent Swarm

## Agent Types

Defined in `research_swarm/config.py` (`AGENT_DEFINITIONS`) and implemented in `research_swarm/agents/`.

| Agent ID | Name | Description | Tools |
|----------|------|-------------|-------|
| `paper-collector` | Paper Collector | Scours web, Reddit, HN, Twitter, arXiv, Semantic Scholar for papers and resources | web_search, fetch_url, arxiv_search, semantic_scholar_search |
| `implementer` | Implementer | Reproduces methods in code, runs experiments in Modal sandboxes, logs to W&B, pushes to GitHub | modal_sandbox, wandb_log, github_push |
| `research-director` | Research Director | Identifies promising research directions from paper analysis | web_search, fetch_url, arxiv_search |

## Orchestration (`orchestrator.py`)

```
Query → Triage (LLM) → {agents: [ids], sub_tasks: {id: str}}
     → For each agent: agent.run(sub_task) → AgentResult
     → Merge (LLM) → merged_answer
```

- **Triage**: `TRIAGE_SYSTEM_PROMPT` + available agents → JSON with `agents` and `sub_tasks`
- **Sequential execution**: Agents run one after another; no parallelism between agents (intentional to avoid token contention)
- **Merge**: Single LLM call to synthesize all agent outputs into one report

## Base Agent (`agents/base.py`)

- `BaseAgent`: Tool-use loop (prompt → model → tool calls → model → … → final answer)
- `AgentEvent`: `agent_id`, `agent_name`, `event_type`, `message`, `timestamp`, `meta`
- `AgentResult`: `agent_id`, `agent_name`, `answer`, `events`, `usage`
- Events persisted via `db.insert_event()`; tool results mapped to `papers`, `experiments` in `_persist_tool_results()`
- `_check_cancelled()`: Polls `db.get_task()` for `status == "cancelled"`

## Tool Registry (`research_swarm/tools/`)

| Tool | Module | Persists To |
|------|--------|-------------|
| web_search | web_search.py | papers (from snippets) |
| fetch_url | fetch_url.py | — |
| arxiv_search | arxiv_search.py | papers |
| semantic_scholar_search | semantic_scholar.py | papers |
| modal_sandbox | modal_sandbox.py | experiments |
| wandb_log | wandb_log.py | — |
| github_push | github_repo.py | — |

Tools are JSON-schema functions; agents receive schemas via `_build_tool_schemas()` and call `TOOL_REGISTRY[name]["fn"]`.

## Adding a New Agent

1. Create `research_swarm/agents/<name>.py` extending `BaseAgent`, set `agent_id` and `system_prompt`
2. Add entry to `AGENT_CLASSES` in `research_swarm/agents/__init__.py`
3. Add entry to `AGENT_DEFINITIONS` in `research_swarm/config.py` (name, description, tools)
4. Update `TRIAGE_SYSTEM_PROMPT` in config if the agent should be routable

## Adding a New Tool

1. Create `research_swarm/tools/<name>.py` with `fn()` and `TOOL_SCHEMA`
2. Register in `research_swarm/tools/__init__.py` → `TOOL_REGISTRY`
3. Assign to agents in `AGENT_DEFINITIONS`
