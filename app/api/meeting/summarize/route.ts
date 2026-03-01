import { NextRequest, NextResponse } from "next/server"

const MODAL_URL = process.env.MODAL_ENDPOINT_URL || "http://localhost:8000"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const events = body.events
    const projectContext = body.projectContext ?? ""

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: "No events provided" },
        { status: 400 },
      )
    }

    const res = await fetch(`${MODAL_URL}/research/summarize-meeting`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        events,
        project_context: projectContext,
      }),
      signal: AbortSignal.timeout(120_000),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => "Unknown error")
      return NextResponse.json(
        { error: "Summarization failed", detail },
        { status: res.status },
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to reach Modal endpoint", detail: String(err) },
      { status: 502 },
    )
  }
}
