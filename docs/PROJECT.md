# Project Overview

> **Hackathon project** — see [HACKATHON.md](./HACKATHON.md) for priorities. Focus on visibility and wow factor.

## Premise

**Control an Agent Swarm (# & type of workers) to collaborate on a research project.**

Users create research teams, assign specialized agents to each team, and submit research queries. The system triages each query, routes it to the appropriate agents in the swarm, runs them sequentially, and synthesizes a unified research report — all streamed in real-time to a polished dashboard.

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Project** | A research project scoped to a user. Each project has its own chat history, papers, and can be linked to a team. Projects organize long-running research efforts. |
| **Team** | A named group of enabled agents. Tasks can run with a team (subset of agents) or "all agents" (default). User-scoped via Supabase Auth. |
| **Agent** | A specialized worker with distinct tools and prompts. Agents run sequentially per task; the triage model picks which ones participate. |
| **Task** | A single research query execution: triage → fan-out to agents → merge results. Streamed via SSE. |
| **Swarm** | The collective of all available agents; task routing determines which subset runs. |
| **Memory** | Optional Supermemory integration. Completed research is saved to user-scoped memory containers and recalled as context for future queries. |
| **Knowledge Graph** | Visual map of relationships between memories, papers, experiments, and research directions. Semantic edges are computed via Supermemory similarity search. |

## High-Level Flow

1. User **logs in** via Supabase Auth (Google/GitHub OAuth or email/password).
2. User creates a **Team** and assigns agents (paper-collector, implementer, research-director).
3. User submits a **research query** from the chat console, optionally selecting a team.
4. If Supermemory is enabled, relevant **memory context** is fetched and injected into the query.
5. **Triage**: LLM routes the query to 1+ agents with per-agent sub-tasks.
6. **Agents run sequentially**, each with its own tool-use loop against a shared Qwen3-32B model hosted on Modal.
7. **Merge**: LLM synthesizes agent outputs into one research report.
8. Results persist to Supabase (tasks, papers, experiments, research_directions).
9. Completed research is optionally **saved to Supermemory** for future recall.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16, React 19, Tailwind CSS v4, Radix UI (shadcn/ui) |
| **Backend** | Modal (Python) — FastAPI API + vLLM Qwen3-32B on A100-80GB |
| **Database** | Supabase (PostgreSQL) — teams, tasks, events, papers, experiments, directions, research_projects, chat_history |
| **Auth** | Supabase Auth — Google OAuth, GitHub OAuth, email/password. SSR session management via `@supabase/ssr`. |
| **Memory** | Supermemory (optional) — user-scoped AI memory containers for cross-session context |
| **Secrets** | Modal secrets (HuggingFace, search APIs, Supabase service role) |
| **Icons** | Lucide React |
| **Charts** | Recharts |
| **Markdown** | react-markdown + remark-gfm |

## Dashboard Views

| View | Component | What it shows |
|------|-----------|---------------|
| **Projects** | `ProjectsLanding`, `ProjectDetailView` | Create/manage research projects with per-project chat, papers, and graph |
| **Overview** | `AgentStatusGrid`, `ApiMonitor` | Agent status cards (idle/busy/error), API usage metrics |
| **Research Console** | `ChatInterface` | Query input, SSE streaming, event log, pipeline stepper, team selector, memory context |
| **Knowledge Graph** | `KnowledgeGraphView` | Force-directed graph of memories, papers, experiments, directions with semantic edges |
| **Teams** | `TeamsView`, `TeamCard`, `AgentPicker` | Create/edit/delete teams, assign and toggle agents |
| **Meeting Room** | `MeetingRoom` | Multi-agent discussion with voice synthesis (TTS) |
| **Credits** | `ApiCreditsView` | API keys, endpoints, token usage, cost tracking |
