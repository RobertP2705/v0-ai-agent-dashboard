# Development Guide

## Prerequisites

- Node.js (for Next.js)
- Python 3.11+ (for research_swarm)
- Modal account (`modal token new`)
- Supabase project

## Environment

### Next.js (`.env.local`)

```env
MODAL_ENDPOINT_URL=https://your-username--research-swarm-api.modal.run
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### Modal Secrets

Create via `modal secret create <name> KEY=value`:

| Secret | Keys |
|--------|------|
| `huggingface-secret` | `HF_TOKEN` |
| `supabase-secret` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `search-api-keys` | `TAVILY_API_KEY`, `GITHUB_TOKEN`, `WANDB_API_KEY` |

### Supabase Schema

Run `research_swarm/schema.sql` in the Supabase SQL editor.

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
├── app/                    # Next.js App Router
│   ├── api/
│   │   ├── agents/         # Proxies GET /agents to Modal
│   │   ├── swarm/          # Proxies tasks, stream, cancel to Modal
│   │   └── teams/          # Proxies teams CRUD to Modal (also used by client via Supabase)
│   ├── page.tsx
│   └── layout.tsx
├── components/
│   ├── dashboard/          # Main UI: teams, chat, agent status, meeting room
│   └── ui/                 # Shadcn/Radix primitives
├── lib/
│   ├── supabase.ts         # Direct Supabase client (teams, tasks, papers, etc.)
│   ├── swarm-client.ts     # streamResearch, fetchAgents, cancelTask
│   └── utils.ts
├── research_swarm/        # Modal Python package
│   ├── api.py              # FastAPI routes
│   ├── orchestrator.py     # run_research, triage, merge
│   ├── serve_model.py      # Qwen3Model vLLM
│   ├── config.py           # AGENT_DEFINITIONS, TRIAGE_SYSTEM_PROMPT
│   ├── db.py               # Supabase persistence
│   ├── schema.sql
│   ├── agents/
│   └── tools/
└── docs/                   # This documentation
```

## API Surface (Modal)

| Method | Path | Purpose |
|--------|------|---------|
| GET | /agents | List agents with status (idle/busy) |
| GET | /teams | List teams |
| POST | /teams | Create team |
| GET | /teams/{id} | Get team |
| PUT | /teams/{id} | Update team |
| DELETE | /teams/{id} | Delete team |
| POST | /teams/{id}/agents | Add agent to team |
| DELETE | /teams/{id}/agents/{row_id} | Remove agent |
| PATCH | /teams/{id}/agents/{row_id} | Toggle enabled |
| POST | /research | Submit (blocking) |
| POST | /research/stream | Submit (SSE stream) |
| GET | /tasks | List tasks |
| GET | /tasks/{id} | Get task |
| POST | /tasks/{id}/cancel | Cancel task |
| GET | /tasks/{id}/events | Get task events |
| GET | /papers | List papers |
| GET | /experiments | List experiments |
| GET | /directions | List research directions |

## Dashboard Views

- **Overview**: AgentStatusGrid, ApiMonitor, ChatInterface
- **Teams**: Create teams, assign agents, toggle enabled
- **Meeting Room**: Multi-agent discussion (voice synthesis)
- **Credits**: API usage, cost tracking
