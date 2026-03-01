"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Plus,
  Minus,
  ArrowLeft,
  BookOpen,
  Terminal,
  Compass,
  Users,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  supabaseConfigured,
  fetchTeams,
  createTeam,
  deleteTeam,
  type Team,
} from "@/lib/supabase"
import { scaleAgent } from "@/lib/swarm-client"
import { TeamCard } from "./team-card"

const AGENT_TYPES = [
  {
    id: "paper-collector",
    name: "Paper Collector",
    description: "Finds, reads, and synthesizes academic papers from arXiv and Semantic Scholar.",
    icon: BookOpen,
    color: "text-chart-1",
  },
  {
    id: "implementer",
    name: "Implementer",
    description: "Reproduces papers in code, runs in Modal sandboxes, logs to W&B, pushes to GitHub.",
    icon: Terminal,
    color: "text-chart-2",
  },
  {
    id: "research-director",
    name: "Research Director",
    description: "Identifies promising research directions, gap analysis, novelty assessment.",
    icon: Compass,
    color: "text-chart-3",
  },
] as const

export function TeamsView() {
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [newDesc, setNewDesc] = useState("")

  const loadTeams = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchTeams()
      setTeams(data)
      if (selectedTeam) {
        const refreshed = data.find((t) => t.id === selectedTeam.id)
        if (refreshed) setSelectedTeam(refreshed)
      }
    } catch {
      // Will show empty state
    } finally {
      setLoading(false)
    }
  }, [selectedTeam])

  useEffect(() => {
    loadTeams()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    await createTeam(newName.trim(), newDesc.trim())
    setNewName("")
    setNewDesc("")
    setDialogOpen(false)
    await loadTeams()
  }

  const handleDelete = async (teamId: string) => {
    await deleteTeam(teamId)
    if (selectedTeam?.id === teamId) setSelectedTeam(null)
    await loadTeams()
  }

  const getAgentCount = (agentType: string): number => {
    if (!selectedTeam?.team_agents) return 0
    return selectedTeam.team_agents.filter(
      (ta) => ta.agent_type === agentType && ta.enabled
    ).length
  }

  const [scalingAgent, setScalingAgent] = useState<string | null>(null)

  const handleScale = async (agentType: string, newCount: number) => {
    if (!selectedTeam || newCount < 0 || newCount > 10 || scalingAgent) return
    setScalingAgent(agentType)
    try {
      await scaleAgent(selectedTeam.id, agentType, newCount)
      await loadTeams()
    } catch {
      // ignore
    } finally {
      setScalingAgent(null)
    }
  }

  if (!supabaseConfigured) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 py-20">
        <Users className="h-10 w-10 text-muted-foreground/30" />
        <p className="max-w-sm text-center font-mono text-xs text-muted-foreground">
          Supabase is not configured. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in your <code>.env.local</code> file to
          enable team management.
        </p>
      </div>
    )
  }

  if (selectedTeam) {
    const totalEnabled = AGENT_TYPES.reduce((sum, a) => sum + getAgentCount(a.id), 0)

    return (
      <div className="flex h-full flex-col gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedTeam(null)}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Back
          </Button>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{selectedTeam.name}</h3>
            {selectedTeam.description && (
              <p className="font-mono text-[10px] text-muted-foreground">
                {selectedTeam.description}
              </p>
            )}
          </div>
        </div>

        <Card className="border-border/80 bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Agent Configuration</CardTitle>
              <Badge variant="outline" className="font-mono text-[10px] border-primary/30 bg-primary/5 text-primary">
                {totalEnabled} agent{totalEnabled !== 1 ? "s" : ""} active
              </Badge>
            </div>
            <p className="font-mono text-[10px] text-muted-foreground/70">
              Set the number of instances for each agent type. Use 0 to exclude an agent.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {AGENT_TYPES.map((agent) => {
                const Icon = agent.icon
                const count = getAgentCount(agent.id)
                const isScaling = scalingAgent === agent.id
                const isDisabled = count === 0

                return (
                  <div
                    key={agent.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-3 transition-all duration-200",
                      isDisabled ? "border-border/40 bg-muted/20 opacity-40" : "border-border/80 bg-secondary/20"
                    )}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary">
                      <Icon className={cn("h-4 w-4", agent.color)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground">{agent.name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground line-clamp-1">
                        {agent.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleScale(agent.id, count - 1)}
                        disabled={count <= 0 || isScaling}
                        className="flex h-6 w-6 items-center justify-center rounded border border-border bg-secondary text-foreground/60 transition-colors hover:bg-secondary/80 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <div className="flex items-center gap-1 px-1.5">
                        <Users className="h-3 w-3 text-muted-foreground" />
                        <span className="font-mono text-xs font-semibold tabular-nums w-3 text-center">
                          {count}
                        </span>
                      </div>
                      <button
                        onClick={() => handleScale(agent.id, count + 1)}
                        disabled={count >= 10 || isScaling}
                        className="flex h-6 w-6 items-center justify-center rounded border border-border bg-secondary text-foreground/60 transition-colors hover:bg-secondary/80 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-mono text-[9px] min-w-[52px] justify-center",
                        isDisabled
                          ? "border-muted text-muted-foreground"
                          : "border-success/30 text-success"
                      )}
                    >
                      {isDisabled ? "off" : count === 1 ? "active" : `${count}x`}
                    </Badge>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground">Research Teams</h3>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">
            Create teams and assign specialized agents
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              New Team
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Team</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="team-name" className="text-xs">
                  Team Name
                </Label>
                <Input
                  id="team-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Attention Mechanisms Research"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="team-desc" className="text-xs">
                  Description
                </Label>
                <Textarea
                  id="team-desc"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="What this team focuses on..."
                  className="font-mono text-xs"
                  rows={3}
                />
              </div>
              <Button onClick={handleCreate} disabled={!newName.trim()} className="w-full">
                Create Team
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="py-12 text-center font-mono text-xs text-muted-foreground">
          Loading teams...
        </p>
      ) : teams.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-card">
            <Users className="h-7 w-7 text-muted-foreground/30" />
          </div>
          <p className="font-mono text-xs text-muted-foreground/70">
            No teams yet. Create one to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              onSelect={setSelectedTeam}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
