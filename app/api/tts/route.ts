import { NextRequest, NextResponse } from "next/server"

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY is not configured" },
      { status: 500 },
    )
  }

  let text: string
  let voice_id: string

  try {
    const body = await req.json()
    text = body.text
    voice_id = body.voice_id
    if (!text || !voice_id) {
      return NextResponse.json(
        { error: "Missing required fields: text, voice_id" },
        { status: 400 },
      )
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      },
    )

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown ElevenLabs error")
      return NextResponse.json(
        { error: `ElevenLabs API error: ${res.status} - ${errorText}` },
        { status: res.status },
      )
    }

    const audioBuffer = await res.arrayBuffer()

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400",
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json(
      { error: `TTS request failed: ${message}` },
      { status: 500 },
    )
  }
}
