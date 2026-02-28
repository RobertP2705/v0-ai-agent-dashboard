"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BookOpen, Terminal, Compass, FileText, FlaskConical, Signpost } from "lucide-react"
import { cn } from "@/lib/utils"
import { supabaseConfigured, fetchDashboardStats, type DashboardStats } from "@/lib/supabase"
import { fetchAgents, type SwarmAgent } from "@/lib/swarm-client"
import type { AgentStatus } from "@/lib/simulation-data"
import { getStatusColor } from "@/lib/simulation-data"

const agentIcons: Record<string, React.ElementType> = {
  "paper-collector": BookOpen,
  implementer: Terminal,
  "research-director": Compass,
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

export function AgentStatusGrid() {
  const [agents, setAgents] = useState<SwarmAgent[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await fetchAgents()
      setAgents(data.length > 0 ? data : [])
    } catch {
      setAgents([])
    }
    if (supabaseConfigured) {
      try {
        setStats(await fetchDashboardStats())
      } catch {
        // keep null
      }
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 15000)
    return () => clearInterval(interval)
  }, [refresh])

  return (
    <div className="space-y-3">
      {agents.length === 0 ? (
        <div className="flex items-center justify-center rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-4 py-8">
          <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
            TODO: Configure MODAL_ENDPOINT_URL to display agent status
          </Badge>
        </div>
      ) : (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {agents.map((agent) => {
          const Icon = agentIcons[agent.id] || BookOpen
          return (
            <Card key={agent.id} className="border-border bg-card/80 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary">
                    <Icon className="h-3.5 w-3.5 text-foreground" />
                  </div>
                  <CardTitle className="text-sm font-medium">{agent.name}</CardTitle>
                </div>
                <Badge
                  variant="outline"
                  className={cn("font-mono text-[10px] uppercase", getStatusColor(agent.status))}
                >
                  <StatusDot status={agent.status} />
                  {agent.status}
                </Badge>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-xs text-muted-foreground line-clamp-1">
                  {agent.task || agent.description}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>
      )}

      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="flex items-center gap-2 rounded-md border border-border bg-card/80 px-3 py-2">
            <FileText className="h-3.5 w-3.5 text-chart-1" />
            <div>
              <p className="font-mono text-[10px] text-muted-foreground">Papers</p>
              <p className="font-mono text-sm font-semibold">{stats.totalPapers}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border bg-card/80 px-3 py-2">
            <FlaskConical className="h-3.5 w-3.5 text-chart-2" />
            <div>
              <p className="font-mono text-[10px] text-muted-foreground">Experiments</p>
              <p className="font-mono text-sm font-semibold">{stats.totalExperiments}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border bg-card/80 px-3 py-2">
            <Signpost className="h-3.5 w-3.5 text-chart-3" />
            <div>
              <p className="font-mono text-[10px] text-muted-foreground">Directions</p>
              <p className="font-mono text-sm font-semibold">{stats.totalDirections}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
