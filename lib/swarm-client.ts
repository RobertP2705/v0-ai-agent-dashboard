/**
 * Client library for the Modal Research Swarm API.
 *
 * Team CRUD goes direct to Supabase (see lib/supabase.ts).
 * Research task submission proxies through Next.js API routes.
 */

export interface SwarmAgent {
  id: string
  name: string
  description: string
  tools: string[]
  status: "idle" | "busy" | "error"
  task: string
}

export interface SwarmEvent {
  task_id: string
  agent: string
  type: "thought" | "action" | "result" | "error" | "done" | "timeout_continue"
  message: string
  timestamp: number
  meta?: Record<string, unknown>
}

export interface SwarmTask {
  id: string
  query: string
  status: "pending" | "triaging" | "running" | "completed" | "error"
  assigned_agents: string[]
  merged_answer: string
  total_usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  created_at: string
  team_id: string | null
  project_id: string | null
}

export async function fetchAgents(): Promise<SwarmAgent[]> {
  const res = await fetch("/api/agents")
  if (!res.ok) throw new Error(`Failed to fetch agents: ${res.status}`)
  return res.json()
}

export async function fetchTasks(): Promise<SwarmTask[]> {
  const res = await fetch("/api/swarm")
  if (!res.ok) throw new Error(`Failed to fetch tasks: ${res.status}`)
  return res.json()
}

export async function scaleAgent(teamId: string, agentType: string, count: number): Promise<void> {
  const res = await fetch(`/api/agents/scale`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ team_id: teamId, agent_type: agentType, count }),
  })
  if (!res.ok) throw new Error(`Scale failed: ${res.status}`)
}

export async function cancelTask(taskId: string): Promise<void> {
  await fetch("/api/swarm/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task_id: taskId }),
  })
}

export function streamResearch(
  query: string,
  onEvent: (event: SwarmEvent) => void,
  onDone: () => void,
  onError: (error: Error) => void,
  teamId?: string,
  projectId?: string,
  continueTaskId?: string,
): AbortController {
  const controller = new AbortController()

  const body: Record<string, unknown> = {
    query,
    team_id: teamId,
    project_id: projectId,
  }
  if (continueTaskId) body.continue_task_id = continueTaskId

  fetch("/api/swarm/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        let detail = ""
        try { const body = await res.json(); detail = body.detail || body.error || "" } catch { /* ignore */ }
        throw new Error(`Stream failed: ${res.status}${detail ? ` — ${detail.slice(0, 300)}` : ""}`)
      }
      const reader = res.body?.getReader()
      if (!reader) throw new Error("No response body")

      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const data = line.slice(6).trim()
          if (data === "[DONE]") {
            onDone()
            return
          }
          try {
            onEvent(JSON.parse(data))
          } catch {
            // skip malformed lines
          }
        }
      }
      // Process any remaining buffered data after stream closes
      if (buffer.startsWith("data: ")) {
        const data = buffer.slice(6).trim()
        if (data === "[DONE]") {
          onDone()
          return
        }
        try {
          onEvent(JSON.parse(data))
        } catch {
          // skip malformed
        }
      }
      onDone()
    })
    .catch((err) => {
      if (err.name !== "AbortError") onError(err)
    })

  return controller
}
