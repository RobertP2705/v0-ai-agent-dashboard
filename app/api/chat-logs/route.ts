import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("chat_logs")
    .select("*")
    .order("created_at", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Nest children under their parents
  const parentLogs = data.filter((log: Record<string, unknown>) => !log.parent_id)
  const childLogs = data.filter((log: Record<string, unknown>) => log.parent_id)

  const nested = parentLogs.map((parent: Record<string, unknown>) => ({
    ...parent,
    children: childLogs.filter((child: Record<string, unknown>) => child.parent_id === parent.id),
  }))

  return NextResponse.json(nested)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const body = await request.json()

  const { data, error } = await supabase
    .from("chat_logs")
    .insert({
      id: body.id,
      parent_id: body.parent_id || null,
      timestamp: body.timestamp,
      agent: body.agent,
      type: body.type,
      message: body.message,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
