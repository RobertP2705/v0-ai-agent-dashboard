import { NextRequest, NextResponse } from "next/server"

const MODAL_URL = process.env.MODAL_ENDPOINT_URL || "http://localhost:8000"

export async function POST(req: NextRequest) {
  try {
    const { task_id } = await req.json()
    if (!task_id) {
      return NextResponse.json({ error: "task_id required" }, { status: 400 })
    }
    const res = await fetch(`${MODAL_URL}/tasks/${task_id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
    if (!res.ok) {
      return NextResponse.json({ error: `Cancel failed: ${res.status}` }, { status: res.status })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to reach Modal endpoint", detail: String(err) },
      { status: 502 },
    )
  }
}
