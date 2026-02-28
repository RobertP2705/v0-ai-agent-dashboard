import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("token_usage")
    .select("*")
    .order("created_at", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Map to the shape the chart component expects
  const mapped = (data || []).map((row: Record<string, unknown>) => ({
    time: row.time_label as string,
    input: row.input_tokens as number,
    output: row.output_tokens as number,
  }))

  return NextResponse.json(mapped)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const body = await request.json()

  const { data, error } = await supabase
    .from("token_usage")
    .insert({
      time_label: body.time,
      input_tokens: body.input,
      output_tokens: body.output,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
