# Documentation Index

> **HACKATHON PROJECT** — This is a hackathon demo. Read [HACKATHON.md](./HACKATHON.md) first for priorities and ground rules before making any changes.

Docs for the **Magi Swam — AI Agent Research Dashboard**. Control the number and type of AI workers that collaborate on research projects.

| Doc | Purpose |
|-----|---------|
| [HACKATHON.md](./HACKATHON.md) | **Read first.** Hackathon priorities, wow-factor guidelines, what to avoid |
| [PROJECT.md](./PROJECT.md) | Premise, core concepts, high-level flow, tech stack |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System diagram, data flow, auth, memory, persistence, API paths |
| [AGENTS.md](./AGENTS.md) | Agent types, orchestration, tools, adding agents/tools |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Setup, env vars, project layout, API surface, dashboard views |

Database schema is the source of truth in `research_swarm/schema.sql` (9 tables); migrations are in `scripts/` (001–005). Most tables have RLS disabled; `research_projects` has full RLS.

**Quick start for agents**: Read HACKATHON.md, then PROJECT.md, then ARCHITECTURE.md. Use AGENTS.md when modifying the swarm; use DEVELOPMENT.md for setup and deployment.
