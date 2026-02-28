import { NextRequest, NextResponse } from "next/server"

const MODAL_URL = process.env.MODAL_ENDPOINT_URL || "http://localhost:8000"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const res = await fetch(`${MODAL_URL}/teams/${id}`, { cache: "no-store" })
    if (!res.ok) return NextResponse.json({ error: res.status }, { status: res.status })
    return NextResponse.json(await res.json())
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await req.json()
    const res = await fetch(`${MODAL_URL}/teams/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) return NextResponse.json({ error: res.status }, { status: res.status })
    return NextResponse.json(await res.json())
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const res = await fetch(`${MODAL_URL}/teams/${id}`, { method: "DELETE" })
    if (!res.ok) return NextResponse.json({ error: res.status }, { status: res.status })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
