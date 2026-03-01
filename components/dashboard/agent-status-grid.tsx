"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BookOpen, Terminal, Compass, FileText, FlaskConical, Signpost, Plus, Minus, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { supabaseConfigured, fetchDashboardStats, fetchDashboardStatsForProject, fetchTeams, type DashboardStats, type Team } from "@/lib/supabase"
import { fetchAgents, scaleAgent, type SwarmAgent } from "@/lib/swarm-client"
import type { AgentStatus } from "@/lib/simulation-data"
import { getStatusColor } from "@/lib/simulation-data"
import { useStreaming } from "@/lib/streaming-context"

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

function InstanceCounter({
  agentType,
  count,
  teamId,
  onScaled,
}: {
  agentType: string
  count: number
  teamId: string
  onScaled: () => void
}) {
  const [isLoading, setIsLoading] = useState(false)

  const handleScale = async (newCount: number) => {
    if (newCount < 1 || newCount > 10 || isLoading) return
    setIsLoading(true)
    try {
      await scaleAgent(teamId, agentType, newCount)
      onScaled()
    } catch {
      // ignore
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => handleScale(count - 1)}
        disabled={count <= 1 || isLoading}
        className="flex h-5 w-5 items-center justify-center rounded border border-border bg-secondary text-foreground/60 transition-colors hover:bg-secondary/80 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Minus className="h-2.5 w-2.5" />
      </button>
      <div className="flex items-center gap-1 px-1">
        <Users className="h-3 w-3 text-muted-foreground" />
        <span className="font-mono text-xs font-semibold tabular-nums w-3 text-center">{count}</span>
      </div>
      <button
        onClick={() => handleScale(count + 1)}
        disabled={count >= 10 || isLoading}
        className="flex h-5 w-5 items-center justify-center rounded border border-border bg-secondary text-foreground/60 transition-colors hover:bg-secondary/80 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Plus className="h-2.5 w-2.5" />
      </button>
    </div>
  )
}

interface AgentStatusGridProps {
  projectId?: string
  teamId?: string
}

export function AgentStatusGrid({ projectId, teamId }: AgentStatusGridProps = {}) {
  const [agents, setAgents] = useState<SwarmAgent[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const { isStreaming, activeAgents } = useStreaming()

  const selectedTeam = teams.find((t) => t.id === teamId)

  function getInstanceCount(agentType: string): number {
    if (!selectedTeam?.team_agents) return 1
    return selectedTeam.team_agents.filter(
      (ta) => ta.agent_type === agentType && ta.enabled
    ).length || 1
  }

  const refresh = useCallback(async () => {
    try {
      const data = await fetchAgents()
      setAgents(data.length > 0 ? data : [])
    } catch {
      setAgents([])
    }
    if (supabaseConfigured) {
      try {
        setStats(
          projectId
            ? await fetchDashboardStatsForProject(projectId)
            : await fetchDashboardStats()
        )
      } catch {
        // keep null
      }
      try {
        setTeams(await fetchTeams())
      } catch {
        // keep empty
      }
    }
  }, [projectId])

  // Poll faster (3s) while streaming, normal (15s) otherwise
  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, isStreaming ? 3000 : 15000)
    return () => clearInterval(interval)
  }, [refresh, isStreaming])

  return (
    <div className="space-y-3">
      {agents.length === 0 ? (
        <div className="flex items-center justify-center rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-4 py-8">
          <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
            TODO: Configure MODAL_ENDPOINT_URL to display agent status
          </Badge>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {agents.map((agent) => {
              const Icon = agentIcons[agent.id] || BookOpen
              const count = getInstanceCount(agent.id)
              const effectiveStatus: AgentStatus =
                isStreaming && activeAgents.includes(agent.id) ? "busy" : agent.status
              return (
                <Card key={agent.id} className="border-border bg-card/80 backdrop-blur-sm">
                  <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary">
                        <Icon className="h-3.5 w-3.5 text-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-medium">{agent.name}</CardTitle>
                        {count > 1 && (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {count} instances
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedTeam && (
                        <InstanceCounter
                          agentType={agent.id}
                          count={count}
                          teamId={selectedTeam.id}
                          onScaled={refresh}
                        />
                      )}
                      <Badge
                        variant="outline"
                        className={cn("font-mono text-[10px] uppercase", getStatusColor(effectiveStatus))}
                      >
                        <StatusDot status={effectiveStatus} />
                        {effectiveStatus}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="font-mono text-xs text-muted-foreground line-clamp-1">
                      {effectiveStatus === "busy" && isStreaming
                        ? "Processing research query..."
                        : agent.task || agent.description}
                    </p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {stats && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
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
