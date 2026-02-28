import { NextRequest, NextResponse } from "next/server"

const MODAL_URL = process.env.MODAL_ENDPOINT_URL || "http://localhost:8000"

export async function POST(req: NextRequest) {
  try {
    const { team_id, agent_type, count } = await req.json()
    if (!team_id || !agent_type || count == null) {
      return NextResponse.json({ error: "team_id, agent_type, and count are required" }, { status: 400 })
    }
    const res = await fetch(`${MODAL_URL}/teams/${team_id}/agents/scale`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_type, count }),
    })
    if (!res.ok) {
      return NextResponse.json({ error: `Scale failed: ${res.status}` }, { status: res.status })
    }
    return NextResponse.json(await res.json())
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to reach Modal endpoint", detail: String(err) },
      { status: 502 },
    )
  }
}
