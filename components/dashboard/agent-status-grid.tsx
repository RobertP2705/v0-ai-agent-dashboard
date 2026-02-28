"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Cpu, MemoryStick, Search, Code, FlaskConical } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AgentInfo, AgentStatus } from "@/lib/simulation-data"
import { getStatusColor } from "@/lib/simulation-data"

function MiniGraph({
  data,
  color,
  height = 32,
}: {
  data: number[]
  color: string
  height?: number
}) {
  const max = 100
  const width = 120
  const points = data
    .map(
      (v, i) =>
        `${(i / (data.length - 1)) * width},${height - (v / max) * height}`
    )
    .join(" ")

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      <defs>
        <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polyline
        points={`0,${height} ${points} ${width},${height}`}
        fill={`url(#grad-${color})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const agentIcons: Record<string, React.ElementType> = {
  "Paper Finder": Search,
  Coder: Code,
  Tester: FlaskConical,
}

function StatusDot({ status }: { status: AgentStatus }) {
  return (
    <span className="relative flex h-2 w-2">
      {status === "busy" && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
      )}
      <span
        className={cn(
          "relative inline-flex h-2 w-2 rounded-full",
          status === "idle" && "bg-info",
          status === "busy" && "bg-success",
          status === "error" && "bg-destructive"
        )}
      />
    </span>
  )
}

interface AgentStatusGridProps {
  agents: AgentInfo[]
}

export function AgentStatusGrid({ agents }: AgentStatusGridProps) {
  const [liveAgents, setLiveAgents] = useState(agents)

  const updateAgents = useCallback(() => {
    setLiveAgents((prev) =>
      prev.map((agent) => {
        const newCpu = Math.max(
          0,
          Math.min(100, agent.cpuCurrent + (Math.random() - 0.5) * 8)
        )
        const newMem = Math.max(
          0,
          Math.min(100, agent.memoryCurrent + (Math.random() - 0.5) * 5)
        )
        return {
          ...agent,
          cpuCurrent: Math.round(newCpu),
          memoryCurrent: Math.round(newMem),
          cpuHistory: [...agent.cpuHistory.slice(1), newCpu],
          memoryHistory: [...agent.memoryHistory.slice(1), newMem],
        }
      })
    )
  }, [])

  useEffect(() => {
    const interval = setInterval(updateAgents, 1500)
    return () => clearInterval(interval)
  }, [updateAgents])

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {liveAgents.map((agent) => {
        const Icon = agentIcons[agent.name] || Code
        return (
          <Card
            key={agent.id}
            className="border-border bg-card/80 backdrop-blur-sm"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary">
                  <Icon className="h-3.5 w-3.5 text-foreground" />
                </div>
                <CardTitle className="text-sm font-medium">
                  {agent.name}
                </CardTitle>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "font-mono text-[10px] uppercase",
                  getStatusColor(agent.status)
                )}
              >
                <StatusDot status={agent.status} />
                {agent.status}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="font-mono text-xs text-muted-foreground line-clamp-1">
                {agent.task}
              </p>

              <div className="flex items-center gap-4">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Cpu className="h-3 w-3 text-chart-1" />
                    <span className="font-mono text-[10px] text-muted-foreground">
                      CPU
                    </span>
                    <span className="ml-auto font-mono text-[10px] font-medium text-foreground">
                      {agent.cpuCurrent}%
                    </span>
                  </div>
                  <MiniGraph
                    data={agent.cpuHistory}
                    color="oklch(0.72 0.19 160)"
                  />
                </div>

                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <MemoryStick className="h-3 w-3 text-chart-2" />
                    <span className="font-mono text-[10px] text-muted-foreground">
                      MEM
                    </span>
                    <span className="ml-auto font-mono text-[10px] font-medium text-foreground">
                      {agent.memoryCurrent}%
                    </span>
                  </div>
                  <MiniGraph
                    data={agent.memoryHistory}
                    color="oklch(0.65 0.17 250)"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
