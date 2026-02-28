"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Mic } from "lucide-react"

export function MeetingRoom() {
  return (
    <div className="flex min-h-full flex-col gap-3">
      <Card className="flex flex-1 flex-col items-center justify-center border border-dashed border-muted-foreground/30 bg-muted/30">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12">
          <Mic className="h-10 w-10 text-muted-foreground/50" />
          <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
            TODO: ElevenLabs TTS + real-time agent transcript integration
          </Badge>
        </CardContent>
      </Card>
    </div>
  )
}
