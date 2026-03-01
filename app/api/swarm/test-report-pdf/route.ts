import { NextRequest, NextResponse } from "next/server"

const MODAL_URL = process.env.MODAL_ENDPOINT_URL || "http://localhost:8000"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const projectId =
      typeof body.project_id === "string" ? body.project_id : undefined
    const res = await fetch(`${MODAL_URL}/research/test-report-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId ?? null }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.detail ?? `Modal API error: ${res.status}`, ...data },
        { status: res.status },
      )
    }
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to reach Modal endpoint",
        detail: String(err),
      },
      { status: 502 },
    )
  }
}
