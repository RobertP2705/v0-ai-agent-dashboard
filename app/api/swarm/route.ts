import { NextRequest, NextResponse } from "next/server"

const MODAL_URL = process.env.MODAL_ENDPOINT_URL || "http://localhost:8000"

export async function GET() {
  try {
    const res = await fetch(`${MODAL_URL}/tasks`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: `Modal API error: ${res.status}` },
        { status: res.status },
      )
    }
    return NextResponse.json(await res.json())
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to reach Modal endpoint", detail: String(err) },
      { status: 502 },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const res = await fetch(`${MODAL_URL}/research`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: `Modal API error: ${res.status}` },
        { status: res.status },
      )
    }
    return NextResponse.json(await res.json())
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to reach Modal endpoint", detail: String(err) },
      { status: 502 },
    )
  }
}
