# Architecture

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Next.js Dashboard                                                           │
│  • TeamsView, ChatInterface, AgentStatusGrid, MeetingRoom, ApiCreditsView  │
│  • lib/supabase.ts (direct Supabase for teams, tasks, papers, etc.)         │
│  • lib/swarm-client.ts (streamResearch → /api/swarm/stream)                 │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
        /api/swarm/*      /api/teams/*      Supabase
        (proxies to       (proxies to       (direct from
         Modal)            Modal)           client for teams)
                │               │
                └───────┬───────┘
                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Modal (research-swarm)                                                      │
│  • research_swarm/api.py — FastAPI with CORS                                 │
│  • research_swarm/orchestrator.py — run_research()                           │
│  • research_swarm/serve_model.py — Qwen3Model (vLLM, A100-80GB)              │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Supabase                                                                    │
│  teams, team_agents, tasks, task_events, papers, experiments,               │
│  research_directions                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Paths

| Purpose | Path |
|---------|------|
| Research stream (SSE) | `POST /api/swarm/stream` → Modal `POST /research/stream` |
| Task list | `GET /api/swarm` → Modal `GET /tasks` |
| Cancel task | `POST /api/swarm/cancel` → Modal `POST /tasks/{id}/cancel` |
| Teams (from Next.js) | `lib/supabase.ts` → Supabase `teams`, `team_agents` directly |
| Teams (from Modal) | Modal also has `/teams` CRUD; backend uses Supabase service role |

## Data Flow: Research Task

1. User submits query in `ChatInterface` → `streamResearch(query, ..., teamId?)`
2. `POST /api/swarm/stream` proxies to Modal `POST /research/stream`
3. Modal `run_research(query, model, team_id)`:
   - `db.create_task()` → Supabase
   - `_get_team_agents(team_id)` → enabled agents for team (or all if no team)
   - `_triage(query, model, available_agents)` → `{"agents": [...], "sub_tasks": {...}}`
   - For each agent: `agent.run(sub_task)` → tool loop → `AgentResult`
   - `_merge_results()` → synthesized report
   - `db.update_task()` with `merged_answer`, `total_usage`
4. SSE events stream back: `{task_id, agent, type, message, timestamp}`
5. `ChatInterface` consumes events, updates UI, persists to localStorage

## Persistence

| Source | Tables |
|--------|--------|
| Modal (research_swarm/db.py) | tasks, task_events, papers, experiments, research_directions |
| Client (lib/supabase.ts) | teams, team_agents (CRUD), tasks (read), task_events (read) |

Teams are created/edited from the dashboard and stored in Supabase. The Modal backend reads `team_agents` via Supabase service role to know which agents to use for a given `team_id`.

## Realtime

Supabase Realtime is enabled on `tasks` and `task_events` per `schema.sql`. The dashboard can subscribe for live updates; the chat interface primarily uses SSE from Modal for streaming.
