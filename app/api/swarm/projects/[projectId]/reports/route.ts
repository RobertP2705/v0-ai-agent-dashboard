import { NextRequest, NextResponse } from "next/server"

const MODAL_URL = process.env.MODAL_ENDPOINT_URL || "http://localhost:8000"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId required" },
        { status: 400 },
      )
    }
    const url = new URL(
      `${MODAL_URL}/research/projects/${encodeURIComponent(projectId)}/reports`,
    )
    url.searchParams.set("limit", "50")
    const res = await fetch(url.toString(), {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    })
    const data = await res.json().catch(() => [])
    if (!res.ok) {
      return NextResponse.json(
        { error: Array.isArray(data) ? "Modal API error" : data?.detail ?? res.status },
        { status: res.status },
      )
    }
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to reach Modal endpoint", detail: String(err) },
      { status: 502 },
    )
  }
}
