import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { searchMemories } from "@/lib/supermemory"

export const maxDuration = 300

const MODAL_URL = process.env.MODAL_ENDPOINT_URL || "http://localhost:8000"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const query = typeof body.query === "string" ? body.query : ""

    let memoryContext: { content: string }[] = []
    if (process.env.SUPERMEMORY_API_KEY && query) {
      try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user?.id) {
          const results = await searchMemories({
            q: query,
            containerTags: [user.id],
            limit: 5,
          })
          memoryContext = (results as { content?: string }[])
            .filter((r) => typeof r.content === "string")
            .map((r) => ({ content: r.content! }))
        }
      } catch {
        // non-fatal: proceed without memory context
      }
    }

    const payload =
      memoryContext.length > 0
        ? { ...body, memory_context: memoryContext }
        : body

    const upstreamRes = await fetch(`${MODAL_URL}/research/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5 * 60 * 1000),
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

    return new Response(upstreamRes.body, {
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
