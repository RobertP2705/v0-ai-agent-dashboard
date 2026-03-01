import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { searchMemories } from "@/lib/supermemory"

export const maxDuration = 800

const MODAL_URL = process.env.MODAL_ENDPOINT_URL || "http://localhost:8000"

/** Cancel stream at 750s so we can send timeout_continue before Vercel's 800s limit. */
const STREAM_TIMEOUT_MS = 750 * 1000

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const query = typeof body.query === "string" ? body.query : ""
    const continueTaskId =
      typeof body.continue_task_id === "string" ? body.continue_task_id : undefined

    let memoryContext: { content: string }[] = []
    if (!continueTaskId && process.env.SUPERMEMORY_API_KEY && query) {
      try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user?.id) {
          const results = await searchMemories({
            q: query,
            containerTags: [user.id],
            limit: 10,
          })
          memoryContext = (results as { content?: string }[])
            .filter((r) => typeof r.content === "string")
            .map((r) => ({ content: r.content! }))
        }
      } catch {
        // non-fatal: proceed without memory context
      }
    }

    const basePayload = { ...body }
    basePayload.query = typeof body.query === "string" ? body.query : ""
    basePayload.team_id = body.team_id ?? null
    basePayload.project_id = body.project_id ?? null
    basePayload.continue_task_id = continueTaskId ?? body.continue_task_id ?? null

    const payload =
      memoryContext.length > 0
        ? { ...basePayload, memory_context: memoryContext }
        : basePayload

    const upstreamRes = await fetch(`${MODAL_URL}/research/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45 * 60 * 1000),
    })

    if (!upstreamRes.ok || !upstreamRes.body) {
      let detail = ""
      try { detail = await upstreamRes.text() } catch { /* ignore */ }
      console.error(`[swarm/stream] Modal API error ${upstreamRes.status}:`, detail)
      return new Response(
        JSON.stringify({ error: `Modal API error: ${upstreamRes.status}`, detail }),
        { status: upstreamRes.status, headers: { "Content-Type": "application/json" } },
      )
    }

    const reader = upstreamRes.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let taskId: string | null = null
    const streamStart = Date.now()

    const stream = new ReadableStream({
      async pull(controller) {
        for (;;) {
          const elapsed = Date.now() - streamStart
          if (elapsed >= STREAM_TIMEOUT_MS) {
            controller.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({
                  type: "timeout_continue",
                  task_id: taskId || "",
                  agent: "system",
                  message: "Session time limit reached. Resuming from checkpoint...",
                  timestamp: Date.now() / 1000,
                })}\n\n`
              )
            )
            controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"))
            controller.close()
            try { reader.cancel() } catch { /* ignore */ }
            return
          }

          const waitMs = Math.min(10000, STREAM_TIMEOUT_MS - elapsed)
          let done: boolean
          let value: Uint8Array | undefined
          try {
            const result = await Promise.race([
              reader.read(),
              new Promise<{ done: boolean; value: Uint8Array | undefined }>((_, reject) =>
                setTimeout(() => reject(new Error("_read_timeout")), waitMs)
              ),
            ])
            done = result.done
            value = result.value
          } catch (e) {
            if (e instanceof Error && e.message === "_read_timeout") continue
            throw e
          }

          if (done) {
            if (buffer.trim()) {
              controller.enqueue(new TextEncoder().encode(buffer))
            }
            controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"))
            controller.close()
            return
          }

          buffer += decoder.decode(value, { stream: true })
          const chunks = buffer.split("\n\n")
          buffer = chunks.pop() ?? ""

          for (const chunk of chunks) {
            const line = chunk.split("\n").find((l) => l.startsWith("data: "))
            if (line) {
              const data = line.slice(6).trim()
              if (data !== "[DONE]") {
                try {
                  const obj = JSON.parse(data) as { task_id?: string }
                  if (obj.task_id) taskId = obj.task_id
                } catch {
                  // ignore parse errors
                }
              }
              controller.enqueue(new TextEncoder().encode(chunk + "\n\n"))
            }
          }
          break
        }
      },
    })

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Failed to reach Modal endpoint", detail: String(err) }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    )
  }
}
