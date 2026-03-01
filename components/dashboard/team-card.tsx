"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BookOpen, Terminal, Compass, Trash2, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Team } from "@/lib/supabase"

const agentIcons: Record<string, { icon: React.ElementType; color: string }> = {
  "paper-collector": { icon: BookOpen, color: "text-chart-1" },
  implementer: { icon: Terminal, color: "text-chart-2" },
  "research-director": { icon: Compass, color: "text-chart-3" },
}

const agentLabels: Record<string, string> = {
  "paper-collector": "Paper Collector",
  implementer: "Implementer",
  "research-director": "Research Director",
}

/** Short snippet: "Paper Collector (2), Implementer (1), Research Director (1)" for enabled agents. */
export function getTeamAgentsSnippet(team: Team): string {
  const agents = team.team_agents || []
  const byType: Record<string, number> = {}
  for (const a of agents) {
    if (!a.enabled) continue
    byType[a.agent_type] = (byType[a.agent_type] ?? 0) + 1
  }
  const parts = Object.entries(byType)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, count]) => `${agentLabels[type] || type} (${count})`)
  return parts.length ? parts.join(", ") : "No agents"
}

interface TeamCardProps {
  team: Team
  onSelect: (team: Team) => void
  onDelete: (teamId: string) => void
}

export function TeamCard({ team, onSelect, onDelete }: TeamCardProps) {
  const agents = team.team_agents || []
  const enabledCount = agents.filter((a) => a.enabled).length
  const snippet = getTeamAgentsSnippet(team)

  return (
    <Card
      className="group cursor-pointer border-border bg-card/80 backdrop-blur-sm transition-colors hover:border-primary/40"
      onClick={() => onSelect(team)}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
            <Users className="h-3.5 w-3.5 text-primary" />
          </div>
          <CardTitle className="text-sm font-medium">{team.name}</CardTitle>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(team.id)
          }}
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {team.description && (
          <p className="font-mono text-[10px] text-muted-foreground line-clamp-2">
            {team.description}
          </p>
        )}
        <p className="font-mono text-[10px] text-muted-foreground" title={snippet}>
          {snippet}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {agents.map((ta) => {
            const cfg = agentIcons[ta.agent_type]
            const Icon = cfg?.icon || Users
            return (
              <Badge
                key={ta.id}
                variant="outline"
                className={cn(
                  "gap-1 font-mono text-[9px]",
                  ta.enabled ? cfg?.color : "text-muted-foreground line-through"
                )}
              >
                <Icon className="h-3 w-3" />
                {agentLabels[ta.agent_type] || ta.agent_type}
              </Badge>
            )
          })}
          {agents.length === 0 && (
            <span className="font-mono text-[10px] text-muted-foreground">
              No agents assigned
            </span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-muted-foreground">
            {enabledCount} agent{enabledCount !== 1 ? "s" : ""} active
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {new Date(team.created_at).toLocaleDateString()}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
