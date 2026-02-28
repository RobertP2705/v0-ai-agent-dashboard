# Architecture

> **Hackathon project** — see [HACKATHON.md](./HACKATHON.md) for priorities.

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Next.js Dashboard (App Router)                                             │
│                                                                             │
│  Pages:                                                                     │
│  • app/page.tsx → DashboardShell (Overview, Chat, Teams, Meeting, Credits) │
│  • app/auth/login, sign-up, error, callback                                │
│                                                                             │
│  Client Libraries:                                                          │
│  • lib/supabase.ts (direct Supabase for teams, tasks, papers, stats)       │
│  • lib/swarm-client.ts (streamResearch, fetchAgents, cancelTask)           │
│  • lib/supermemory.ts (addMemory, searchMemory — user-scoped)              │
│                                                                             │
│  Auth:                                                                      │
│  • middleware.ts → Supabase session refresh + auth redirects               │
│  • lib/supabase/client.ts (browser), lib/supabase/server.ts (SSR)         │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
        /api/swarm/*      /api/teams/*      /api/memory/*
        /api/agents/*     (proxies to       (Supermemory
        (proxies to        Modal)           integration)
         Modal)
                │               │
                └───────┬───────┘
                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Modal (research-swarm)                                                     │
│  • research_swarm/api.py — FastAPI with CORS                                │
│  • research_swarm/orchestrator.py — run_research(query, model, team_id)    │
│  • research_swarm/serve_model.py — Qwen3Model (vLLM, A100-80GB)           │
│  • research_swarm/db.py — Supabase persistence (service role)              │
│  • research_swarm/agents/ — Paper Collector, Implementer, Research Director│
│  • research_swarm/tools/ — web_search, arxiv, sandbox, W&B, GitHub        │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Supabase (PostgreSQL)                                                      │
│  Tables: teams, team_agents, tasks, task_events, papers, experiments,      │
│          research_directions                                                │
│  Auth: Google OAuth, GitHub OAuth, email/password                           │
│  RLS: All tables scoped by user_id (via team ownership chain)              │
│  Realtime: Enabled on tasks, task_events                                    │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────┐
                    │  Supermemory (opt.)  │
                    │  User-scoped memory │
                    │  containers for     │
                    │  cross-session       │
                    │  research context    │
                    └─────────────────────┘
```

## Key Paths

| Purpose | Path |
|---------|------|
| Research stream (SSE) | `POST /api/swarm/stream` → Modal `POST /research/stream` |
| Research (blocking) | `POST /api/swarm` → Modal `POST /research` |
| Task list | `GET /api/swarm` → Modal `GET /tasks` |
| Cancel task | `POST /api/swarm/cancel` → Modal `POST /tasks/{id}/cancel` |
| Agent list | `GET /api/agents` → Modal `GET /agents` |
| Scale agents | `POST /api/agents/scale` → Modal (team_id, agent_type, count) |
| Teams (client-side) | `lib/supabase.ts` → Supabase `teams`, `team_agents` directly |
| Teams (via API) | `/api/teams/*` → Modal `/teams/*` (service role) |
| Memory status | `GET /api/memory/status` → checks `SUPERMEMORY_API_KEY` |
| Add memory | `POST /api/memory/add` → Supermemory API (user-scoped container) |
| Auth login | `app/auth/login/page.tsx` → Supabase Auth (OAuth + email) |
| Auth callback | `app/auth/callback/route.ts` → code exchange |

## Data Flow: Research Task

1. User submits query in `ChatInterface` → `streamResearch(query, ..., teamId?)`
2. `POST /api/swarm/stream`:
   - If Supermemory enabled: searches memory for relevant context, prepends to query
   - Proxies to Modal `POST /research/stream`
3. Modal `run_research(query, model, team_id)`:
   - `db.create_task()` → Supabase
   - `_get_team_agents(team_id)` → enabled agents for team (or all if no team)
   - `_triage(query, model, available_agents)` → `{"agents": [...], "sub_tasks": {...}}`
   - For each agent: `agent.run(sub_task)` → tool loop → `AgentResult`
   - `_merge_results()` → synthesized report
   - `db.update_task()` with `merged_answer`, `total_usage`
4. SSE events stream back: `{task_id, agent, type, message, timestamp}`
5. `ChatInterface` consumes events, updates UI, persists to Supabase `chat_history` table
6. On completion, result optionally saved to Supermemory via `POST /api/memory/add`

## Authentication & Authorization

| Layer | Mechanism |
|-------|-----------|
| **Login** | Supabase Auth — Google OAuth, GitHub OAuth, email/password (`app/auth/`) |
| **Session** | `@supabase/ssr` — cookie-based SSR sessions, refreshed in `middleware.ts` |
| **Client** | `lib/supabase/client.ts` (browser), `lib/supabase/server.ts` (server components/routes) |
| **Middleware** | `middleware.ts` → refreshes session, redirects unauthenticated users to `/auth/login` |
| **RLS** | Row Level Security on all tables — users see only their own teams and team-scoped data |
| **Backend** | Modal uses Supabase **service role key** to bypass RLS for task execution |

## Memory Integration (Supermemory)

- **Feature-flagged**: Enabled only when `SUPERMEMORY_API_KEY` is set
- **User-scoped**: Each user gets their own memory container (keyed by user ID)
- **Add**: Completed research tasks are saved to memory with title + content
- **Search**: When starting a new query, relevant memories are fetched and injected as context
- **API**: `lib/supermemory.ts` wraps the Supermemory SDK (`addMemory`, `searchMemory`)

## Persistence

| Source | Tables |
|--------|--------|
| Modal (`research_swarm/db.py`) | tasks, task_events, papers, experiments, research_directions |
| Client (`lib/supabase.ts`) | teams, team_agents (CRUD), tasks (read), task_events (read) |
| Auth (`Supabase Auth`) | `auth.users` (managed by Supabase) |

Teams are created/edited from the dashboard and stored in Supabase. The Modal backend reads `team_agents` via Supabase service role to know which agents to use for a given `team_id`.

Schema is defined in `research_swarm/schema.sql` (7 tables: teams, team_agents, tasks, task_events, papers, experiments, research_directions).

### Row Level Security (RLS)

All tables have RLS enabled. Ownership chain: `auth.users` → `teams.user_id` → everything else via `team_id`.

- **teams**: SELECT/INSERT/UPDATE/DELETE where `auth.uid() = user_id`
- **team_agents**: all ops scoped through parent team ownership
- **tasks**: SELECT only — must have non-null `team_id` owned by user (migration 003)
- **task_events, papers, experiments, research_directions**: SELECT only — scoped through parent task → team ownership
- **Modal backend**: uses service role key, bypasses RLS entirely

### Migration Scripts (`scripts/`)

Run in the Supabase SQL editor **in order** after `schema.sql`:

| Script | Purpose |
|--------|---------|
| `001_add_user_id_to_teams.sql` | Adds `user_id` to teams, index, enables RLS on all tables |
| `002_delete_legacy_user_agnostic_data.sql` | One-time cleanup of pre-auth data (skip if DB is fresh) |
| `003_hide_tasks_with_null_team_from_all.sql` | Tightens RLS: tasks must have a team owned by user to be visible |

## Realtime

Supabase Realtime is enabled on `tasks` and `task_events` per `schema.sql`. The dashboard can subscribe for live updates; the chat interface primarily uses SSE from Modal for streaming.
