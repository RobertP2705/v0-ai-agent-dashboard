import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { addMemory } from "@/lib/supermemory"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const content = typeof body.content === "string" ? body.content.trim() : null
    if (!content) {
      return NextResponse.json(
        { error: "Missing or invalid 'content' (string required)" },
        { status: 400 },
      )
    }

    const metadata = typeof body.metadata === "object" && body.metadata !== null
      ? body.metadata
      : undefined
    const title = typeof body.title === "string" ? body.title : undefined

    await addMemory({
      content,
      containerTags: [user.id],
      metadata,
      title,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Error && err.message === "SUPERMEMORY_API_KEY is not set") {
      return NextResponse.json(
        { error: "Memory service not configured" },
        { status: 503 },
      )
    }
    console.error("[memory/add]", err)
    return NextResponse.json(
      { error: "Failed to add memory" },
      { status: 500 },
    )
  }
}
