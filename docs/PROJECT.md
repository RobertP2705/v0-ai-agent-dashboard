# Project Overview

## Premise

**Control an Agent Swarm (# & type of workers) to collaborate on a research project.**

Users create research teams, assign specialized agents to each team, and submit research queries. The system triages each query, routes it to the appropriate agents in the swarm, runs them in parallel, and synthesizes a unified research report.

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Team** | A named group of enabled agents. Tasks can run with a team (subset of agents) or "all agents" (default). |
| **Agent** | A specialized worker with distinct tools and prompts. Agents run sequentially per task, but the triage model picks which ones participate. |
| **Task** | A single research query execution: triage → fan-out to agents → merge results. |
| **Swarm** | The collective of all available agents; task routing determines which subset runs. |

## High-Level Flow

1. User creates a **Team** and assigns agents (paper-collector, implementer, research-director).
2. User submits a **research query** from the chat, optionally selecting a team.
3. **Triage**: LLM routes the query to 1+ agents with per-agent sub-tasks.
4. **Agents run sequentially**, each with its own tool-use loop against a shared Qwen3-32B model.
5. **Merge**: LLM synthesizes agent outputs into one research report.
6. Results persist to Supabase (tasks, papers, experiments, research_directions).

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind, Radix UI
- **Backend**: Modal (Python) — FastAPI API + vLLM Qwen3-32B
- **Database**: Supabase (PostgreSQL) — teams, tasks, events, papers, experiments, directions
- **Secrets**: Modal secrets (HuggingFace, search APIs, Supabase service role)
