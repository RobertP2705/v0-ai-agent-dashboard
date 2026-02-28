# Development Guide

> **Hackathon project** — see [HACKATHON.md](./HACKATHON.md) for priorities.

## Prerequisites

- Node.js (for Next.js)
- Python 3.11+ (for research_swarm)
- Modal account (`modal token new`)
- Supabase project (with Auth enabled for Google/GitHub OAuth)

## Environment

### Next.js (`.env.local`)

```env
MODAL_ENDPOINT_URL=https://your-username--research-swarm-api.modal.run
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPERMEMORY_API_KEY=your_supermemory_api_key   # optional — enables memory features
```

### Modal Secrets

Create via `modal secret create <name> KEY=value`:

| Secret | Keys |
|--------|------|
| `huggingface-secret` | `HF_TOKEN` |
| `supabase-secret` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `search-api-keys` | `TAVILY_API_KEY`, `GITHUB_TOKEN`, `WANDB_API_KEY` |

### Supabase Schema

1. Run `research_swarm/schema.sql` in the Supabase SQL editor
2. Run migrations in `scripts/` in order (001, 002, 003) — see [ARCHITECTURE.md](./ARCHITECTURE.md#migration-scripts-scripts)

### Supabase Auth

Enable these providers in the Supabase dashboard (Authentication → Providers):
- Google OAuth
- GitHub OAuth
- Email/Password

## Running Locally

```bash
# Next.js dashboard
npm install && npm run dev

# Modal API (must be deployed — no local Modal API)
modal deploy research_swarm
```

The dashboard expects `MODAL_ENDPOINT_URL` to point at a deployed Modal app. There is no local Modal API server; streaming goes to the deployed endpoint.

## Project Layout

```
├── app/                        # Next.js App Router
│   ├── api/
│   │   ├── agents/             # GET /agents, POST /agents/scale → Modal
│   │   ├── swarm/              # tasks, stream (SSE), cancel → Modal
│   │   ├── teams/              # teams CRUD → Modal
│   │   └── memory/             # Supermemory status + add
│   ├── auth/
│   │   ├── login/page.tsx      # Login (OAuth + email)
│   │   ├── sign-up/page.tsx    # Sign up (email)
│   │   ├── error/page.tsx      # Auth error display
│   │   └── callback/route.ts   # OAuth code exchange
│   ├── page.tsx                # → DashboardShell
│   ├── layout.tsx              # Root layout (dark theme, Geist fonts)
│   └── globals.css             # Tailwind + OKLCH design tokens
├── components/
│   ├── dashboard/              # Main UI components
│   │   ├── dashboard-shell.tsx # Shell with sidebar, header, view switching
│   │   ├── sidebar-nav.tsx     # Navigation sidebar with user menu
│   │   ├── chat-interface.tsx  # Research console (streaming, events, memory)
│   │   ├── agent-status-grid.tsx # Agent status cards with scaling
│   │   ├── teams-view.tsx      # Team management
│   │   ├── team-card.tsx       # Team card display
│   │   ├── agent-picker.tsx    # Agent type picker for teams
│   │   ├── meeting-room.tsx    # Multi-agent discussion (TTS)
│   │   ├── api-monitor.tsx     # API usage metrics
│   │   ├── api-credits-view.tsx # Keys, endpoints, usage
│   │   └── status-stepper.tsx  # Pipeline progress (Triage → Agents → Synthesize)
│   └── ui/                     # 69 shadcn/Radix UI primitives
├── lib/
│   ├── supabase.ts             # Direct Supabase client (teams, tasks, papers, stats)
│   ├── supabase/
│   │   ├── client.ts           # Browser Supabase client factory
│   │   ├── server.ts           # Server-side Supabase client factory
│   │   └── middleware.ts       # Session refresh + auth redirects
│   ├── swarm-client.ts         # streamResearch, fetchAgents, fetchTasks, cancelTask, scaleAgent
│   ├── supermemory.ts          # addMemory, searchMemory (user-scoped containers)
│   ├── simulation-data.ts      # Types (AgentStatus, LogEntry, StepperStep) + helpers
│   └── utils.ts                # cn() — clsx + tailwind-merge
├── hooks/
│   ├── use-mobile.ts           # Mobile breakpoint detection
│   └── use-toast.ts            # Toast notification system
├── middleware.ts                # Supabase session refresh + auth redirects
├── research_swarm/             # Modal Python package
│   ├── api.py                  # FastAPI routes (CORS, SSE streaming)
│   ├── orchestrator.py         # run_research: triage → agents → merge
│   ├── serve_model.py          # Qwen3Model (vLLM, A100-80GB)
│   ├── config.py               # AGENT_DEFINITIONS, TRIAGE_SYSTEM_PROMPT, model config
│   ├── db.py                   # Supabase persistence (service role)
│   ├── schema.sql              # Base database schema
│   ├── agents/                 # Agent implementations
│   │   ├── base.py             # BaseAgent — tool-use loop, events, cancellation
│   │   ├── paper_collector.py
│   │   ├── implementer.py
│   │   └── research_director.py
│   └── tools/                  # Tool implementations
│       ├── web_search.py       # Tavily web search
│       ├── fetch_url.py        # URL content fetching
│       ├── arxiv_search.py     # arXiv API search
│       ├── semantic_scholar.py # Semantic Scholar API
│       ├── modal_sandbox.py    # Modal sandbox for code execution
│       ├── wandb_log.py        # W&B experiment logging
│       └── github_repo.py      # GitHub repo operations
├── scripts/                    # SQL migration scripts (run in order)
│   ├── 001_add_user_id_to_teams.sql
│   ├── 002_delete_legacy_user_agnostic_data.sql
│   └── 003_hide_tasks_with_null_team_from_all.sql
└── docs/                       # This documentation (for agent context)
```

## API Surface

### Next.js Routes (proxy to Modal)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/agents` | List agents with status |
| POST | `/api/agents/scale` | Scale agent instances (team_id, agent_type, count) |
| GET | `/api/swarm` | List tasks |
| POST | `/api/swarm` | Submit research (blocking) |
| POST | `/api/swarm/stream` | Submit research (SSE stream) — injects Supermemory context |
| POST | `/api/swarm/cancel` | Cancel a running task |
| GET | `/api/teams` | List teams |
| POST | `/api/teams` | Create team |
| GET | `/api/teams/[id]` | Get team |
| PUT | `/api/teams/[id]` | Update team |
| DELETE | `/api/teams/[id]` | Delete team |
| GET | `/api/memory/status` | Check if Supermemory is enabled |
| POST | `/api/memory/add` | Save research to Supermemory |

### Modal Backend Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/agents` | List agents with status (idle/busy) |
| GET | `/teams` | List teams |
| POST | `/teams` | Create team |
| GET | `/teams/{id}` | Get team |
| PUT | `/teams/{id}` | Update team |
| DELETE | `/teams/{id}` | Delete team |
| POST | `/teams/{id}/agents` | Add agent to team |
| DELETE | `/teams/{id}/agents/{row_id}` | Remove agent |
| PATCH | `/teams/{id}/agents/{row_id}` | Toggle enabled |
| POST | `/research` | Submit (blocking) |
| POST | `/research/stream` | Submit (SSE stream) |
| GET | `/tasks` | List tasks |
| GET | `/tasks/{id}` | Get task |
| POST | `/tasks/{id}/cancel` | Cancel task |
| GET | `/tasks/{id}/events` | Get task events |
| GET | `/papers` | List papers |
| GET | `/experiments` | List experiments |
| GET | `/directions` | List research directions |

## Dashboard Views

| View | Key Components | Description |
|------|---------------|-------------|
| **Overview** | `AgentStatusGrid`, `ApiMonitor` | Agent cards (idle/busy/error with scaling), API usage metrics |
| **Research Console** | `ChatInterface`, `StatusStepper` | Query input, SSE streaming, event log, pipeline stepper, team selector, memory context |
| **Teams** | `TeamsView`, `TeamCard`, `AgentPicker` | Create/edit/delete teams, assign and toggle agents |
| **Meeting Room** | `MeetingRoom` | Multi-agent discussion with voice synthesis (TTS) |
| **Credits** | `ApiCreditsView` | API keys, endpoints, token usage, cost tracking |

## Key Libraries

| File | Exports | Purpose |
|------|---------|---------|
| `lib/supabase.ts` | `getTeams`, `createTeam`, `updateTeam`, `deleteTeam`, `getTasksForTeam`, `getEventsForTask`, `getDashboardStats` + TS interfaces | Direct Supabase queries from the client |
| `lib/swarm-client.ts` | `streamResearch`, `fetchAgents`, `fetchTasks`, `scaleAgent`, `cancelTask` | Modal API client |
| `lib/supermemory.ts` | `addMemory`, `searchMemory` | Supermemory SDK wrapper (user-scoped containers) |
| `lib/simulation-data.ts` | `AgentStatus`, `LogEntry`, `StepperStep`, color utilities | Types and helpers for dashboard state |
| `lib/supabase/client.ts` | `createClient` | Browser Supabase client factory |
| `lib/supabase/server.ts` | `createClient` | Server-side Supabase client factory (cookies) |
| `lib/supabase/middleware.ts` | `updateSession` | Session refresh + auth redirect logic |
