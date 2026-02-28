# Hackathon Guidelines

> This project is a **hackathon demo**. Every change should maximize visual impact and "wow factor" for judges and live audiences.

## Priorities (in order)

1. **Visibility** — If the user can't see it, it doesn't count. Every feature must have clear, polished UI feedback. Animations, streaming indicators, status badges, progress bars — make the system feel alive.
2. **Wow factor** — Judges are evaluating in minutes, not hours. Flashy beats thorough. A single impressive demo flow matters more than 10 hidden backend improvements.
3. **Stability** — Don't break what works. A crashed demo is worse than a missing feature.
4. **Breadth over depth** — Show many capabilities lightly rather than one capability deeply. The agent grid, live streaming events, team management, memory integration — all of these should be showcased.

## What to Prioritize

- **Real-time streaming UI** — The SSE event stream from agent execution is the core spectacle. Make it buttery smooth with clear per-agent attribution, tool-call animations, and a visible pipeline stepper.
- **Agent status grid** — Agents should visually pulse/animate when active. Idle vs. busy vs. error states should be obvious at a glance.
- **Team management** — Creating teams and assigning agents should feel drag-and-drop intuitive.
- **Memory integration (Supermemory)** — Show that the system remembers past research. Surface memory context visibly when it enhances a query.
- **Meeting room** — Multi-agent discussion with voice synthesis is a crowd-pleaser. Even a polished placeholder beats a broken feature.
- **Dark theme polish** — The app uses a dark OKLCH theme. Keep it consistent and premium-feeling.
- **Responsive layout** — Demo could happen on a projector, laptop, or tablet. Sidebar + main content should look good at all sizes.

## What to Avoid

- **Backend-only changes** with no visible UI impact — If you can't demo it, deprioritize it.
- **Breaking the streaming flow** — The `POST /api/swarm/stream` → SSE pipeline is the backbone. Test any changes to it thoroughly.
- **Adding heavy dependencies** — Bundle size matters for demo load times.
- **Over-engineering** — No need for perfect error boundaries or exhaustive validation. Good-enough polish wins.
- **Removing existing features** — Even if something seems rough, it might be part of the demo flow.

## Demo Flow (the golden path)

1. User logs in (Supabase Auth — Google/GitHub OAuth or email)
2. Creates a research team, assigns agents (Paper Collector, Implementer, Research Director)
3. Submits a research query from the chat console
4. Watches the pipeline stepper advance: Triage → Agents → Synthesize
5. Sees real-time streaming events with agent names, tool calls, and intermediate results
6. Gets a synthesized research report with papers, experiments, and research directions
7. Result is saved to Supermemory — next query shows memory context being used
8. Agent status grid shows agents going idle → busy → idle through the run
9. API credits view shows token usage and costs

## Tech Constraints

- The Modal backend (Python) is deployed remotely — no local backend server.
- The Qwen3-32B model runs on A100-80GB GPUs via Modal. Cold starts take ~60s.
- Supabase is the single source of truth for persistent state.
- Supermemory is optional (feature-flagged by `SUPERMEMORY_API_KEY` env var).
- The frontend is Next.js 16 with React 19 — use server components where sensible, but most dashboard interactivity requires client components.
