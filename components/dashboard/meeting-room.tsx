"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { Mic, Volume2, BookOpen, Terminal, Compass } from "lucide-react"

const agentConfigs = [
  {
    name: "Paper Collector",
    icon: BookOpen,
    color: "text-chart-1",
    bgColor: "bg-chart-1",
  },
  {
    name: "Implementer",
    icon: Terminal,
    color: "text-chart-2",
    bgColor: "bg-chart-2",
  },
  {
    name: "Research Director",
    icon: Compass,
    color: "text-chart-3",
    bgColor: "bg-chart-3",
  },
]

interface MeetingMessage {
  id: string
  agent: string
  message: string
  timestamp: string
}

const sampleDialogue: string[][] = [
  [
    "I found a promising paper on sparse attention mechanisms on arXiv. The authors report 40% memory savings on sequences over 8k tokens.",
    "Cross-referencing with Semantic Scholar... This paper cites 12 other works. Top result: 'FlashAttention-3'.",
    "Literature review complete. Key trend: hybrid sparse-dense attention is outperforming pure sparse methods.",
  ],
  [
    "I've written a reproduction of the core kernel in PyTorch. Running it in a Modal sandbox now.",
    "Sandbox run complete. Forward pass: 35% speedup confirmed. Logging metrics to W&B and pushing code to GitHub.",
    "Experiment pushed to github.com/user/flash-attn-repro. W&B run shows accuracy within 1e-6 of reference.",
  ],
  [
    "Based on the papers and implementation results, I see three promising directions worth exploring.",
    "Direction 1: Combining sparse attention with mixture-of-experts routing. Feasibility: 0.8, Novelty: 0.7.",
    "Direction 2: Hardware-aware attention for heterogeneous compute. Under-explored in literature. Novelty: 0.9.",
  ],
]

function WaveformVisualizer({
  isActive,
  color,
}: {
  isActive: boolean
  color: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number | null>(null)
  const phaseRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const w = rect.width
    const h = rect.height

    const draw = () => {
      ctx.clearRect(0, 0, w, h)

      const bars = 48
      const barWidth = w / bars - 1

      for (let i = 0; i < bars; i++) {
        const amplitude = isActive
          ? 0.3 +
            0.7 *
              Math.abs(
                Math.sin(phaseRef.current + i * 0.3) *
                  Math.cos(phaseRef.current * 0.7 + i * 0.15)
              )
          : 0.05 + 0.05 * Math.sin(i * 0.5)

        const barHeight = amplitude * h * 0.8
        const x = i * (barWidth + 1)
        const y = (h - barHeight) / 2

        ctx.fillStyle = isActive
          ? color
          : "oklch(0.30 0.01 260)"
        ctx.globalAlpha = isActive ? 0.7 + amplitude * 0.3 : 0.4
        ctx.beginPath()
        ctx.roundRect(x, y, barWidth, barHeight, 1)
        ctx.fill()
      }

      ctx.globalAlpha = 1
      phaseRef.current += isActive ? 0.08 : 0.01
      animFrameRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [isActive, color])

  return (
    <canvas
      ref={canvasRef}
      className="h-12 w-full"
      style={{ display: "block" }}
    />
  )
}

export function MeetingRoom() {
  const [activeAgent, setActiveAgent] = useState(0)
  const [messages, setMessages] = useState<MeetingMessage[]>([])
  const [messageIdx, setMessageIdx] = useState(0)

  const addMessage = useCallback(() => {
    const agentIndex = activeAgent % agentConfigs.length
    const dialogue = sampleDialogue[agentIndex]
    const msgIndex = messageIdx % dialogue.length

    const msg: MeetingMessage = {
      id: `msg-${Date.now()}`,
      agent: agentConfigs[agentIndex].name,
      message: dialogue[msgIndex],
      timestamp: new Date().toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    }

    setMessages((prev) => [...prev.slice(-20), msg])
    setMessageIdx((prev) => prev + 1)

    setActiveAgent((prev) => prev + 1)
  }, [activeAgent, messageIdx])

  useEffect(() => {
    const interval = setInterval(addMessage, 4000)
    return () => clearInterval(interval)
  }, [addMessage])

  const currentAgentConfig = agentConfigs[activeAgent % agentConfigs.length]

  return (
    <div className="flex h-full flex-col gap-3">
      <Card className="border-border bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Mic className="h-3.5 w-3.5 text-primary" />
            Voice Monitor
            <Badge
              variant="outline"
              className={cn(
                "ml-auto font-mono text-[10px]",
                currentAgentConfig.color,
                "border-current/30"
              )}
            >
              <Volume2 className="mr-1 h-3 w-3" />
              {currentAgentConfig.name} speaking
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            {agentConfigs.map((agent, idx) => {
              const isActive = activeAgent % agentConfigs.length === idx
              const Icon = agent.icon
              return (
                <div
                  key={agent.name}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-2 rounded-md border p-2 transition-all",
                    isActive
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-secondary/30"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <div
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded",
                        isActive ? "bg-primary/20" : "bg-secondary"
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-3 w-3",
                          isActive ? agent.color : "text-muted-foreground"
                        )}
                      />
                    </div>
                    <span
                      className={cn(
                        "font-mono text-[10px]",
                        isActive ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {agent.name}
                    </span>
                  </div>
                  <WaveformVisualizer
                    isActive={isActive}
                    color={
                      idx === 0
                        ? "oklch(0.72 0.19 160)"
                        : idx === 1
                          ? "oklch(0.65 0.17 250)"
                          : "oklch(0.68 0.16 300)"
                    }
                  />
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-center font-mono text-[9px] text-muted-foreground">
            ElevenLabs TTS Integration Placeholder - Connect API key to enable
            voice synthesis
          </p>
        </CardContent>
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col border-border bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Meeting Transcript
          </CardTitle>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 p-0">
          <ScrollArea className="h-[300px] px-3 pb-3">
            <div className="space-y-2">
              {messages.map((msg) => {
                const agentCfg = agentConfigs.find(
                  (a) => a.name === msg.agent
                )
                return (
                  <div
                    key={msg.id}
                    className="rounded-md border border-border bg-secondary/30 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-mono text-[9px] px-1 py-0",
                          agentCfg?.color
                        )}
                      >
                        {msg.agent}
                      </Badge>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {msg.timestamp}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-foreground/90 leading-relaxed">
                      {msg.message}
                    </p>
                  </div>
                )
              })}
              {messages.length === 0 && (
                <p className="py-8 text-center font-mono text-xs text-muted-foreground">
                  Waiting for agents to begin discussion...
                </p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
