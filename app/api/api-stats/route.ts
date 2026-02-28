import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("api_usage_stats")
    .select("*")
    .order("recorded_at", { ascending: false })
    .limit(1)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    totalTokens: data.total_tokens,
    inputTokens: data.input_tokens,
    outputTokens: data.output_tokens,
    estimatedCost: Number(data.estimated_cost),
    requestsPerMin: data.requests_per_min,
  })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const body = await request.json()

  const { data, error } = await supabase
    .from("api_usage_stats")
    .insert({
      total_tokens: body.totalTokens,
      input_tokens: body.inputTokens,
      output_tokens: body.outputTokens,
      estimated_cost: body.estimatedCost,
      requests_per_min: body.requestsPerMin,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
