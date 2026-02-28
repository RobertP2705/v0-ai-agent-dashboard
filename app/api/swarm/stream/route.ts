import { NextRequest } from "next/server"

export const maxDuration = 300

const MODAL_URL = process.env.MODAL_ENDPOINT_URL || "http://localhost:8000"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const upstreamRes = await fetch(`${MODAL_URL}/research/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5 * 60 * 1000),
    })

    if (!upstreamRes.ok || !upstreamRes.body) {
      return new Response(
        JSON.stringify({ error: `Modal API error: ${upstreamRes.status}` }),
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
