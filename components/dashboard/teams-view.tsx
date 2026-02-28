"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
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
import { Switch } from "@/components/ui/switch"
import {
  Plus,
  ArrowLeft,
  BookOpen,
  Terminal,
  Compass,
  Users,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  supabaseConfigured,
  fetchTeams,
  createTeam,
  deleteTeam,
  addAgentToTeam,
  removeAgentFromTeam,
  toggleAgentInTeam,
  type Team,
  type TeamAgent,
} from "@/lib/supabase"
import { TeamCard } from "./team-card"
import { AgentPicker } from "./agent-picker"

const agentMeta: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  "paper-collector": { icon: BookOpen, color: "text-chart-1", label: "Paper Collector" },
  implementer: { icon: Terminal, color: "text-chart-2", label: "Implementer" },
  "research-director": { icon: Compass, color: "text-chart-3", label: "Research Director" },
}

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

  const handleAddAgent = async (agentType: string) => {
    if (!selectedTeam) return
    await addAgentToTeam(selectedTeam.id, agentType)
    await loadTeams()
  }

  const handleRemoveAgent = async (agentRowId: string) => {
    await removeAgentFromTeam(agentRowId)
    await loadTeams()
  }

  const handleToggleAgent = async (agentRowId: string, enabled: boolean) => {
    await toggleAgentInTeam(agentRowId, enabled)
    await loadTeams()
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
    const agents = selectedTeam.team_agents || []
    const assignedTypes = agents.map((a) => a.agent_type)

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

        <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="flex flex-col border-border bg-card/80 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Assigned Agents</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {agents.map((ta) => {
                    const meta = agentMeta[ta.agent_type]
                    const Icon = meta?.icon || Users
                    return (
                      <div
                        key={ta.id}
                        className="flex items-center gap-3 rounded-md border border-border bg-secondary/30 px-3 py-2.5"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary">
                          <Icon className={cn("h-4 w-4", meta?.color)} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-foreground">
                            {meta?.label || ta.agent_type}
                          </p>
                          <Badge
                            variant="outline"
                            className={cn(
                              "font-mono text-[9px]",
                              ta.enabled
                                ? "border-success/30 text-success"
                                : "border-muted text-muted-foreground"
                            )}
                          >
                            {ta.enabled ? "enabled" : "disabled"}
                          </Badge>
                        </div>
                        <Switch
                          checked={ta.enabled}
                          onCheckedChange={(checked) => handleToggleAgent(ta.id, checked)}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => handleRemoveAgent(ta.id)}
                        >
                          <X className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    )
                  })}
                  {agents.length === 0 && (
                    <p className="py-8 text-center font-mono text-xs text-muted-foreground">
                      No agents assigned. Add agents from the picker.
                    </p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="flex flex-col border-border bg-card/80 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Add Agents</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <AgentPicker assignedTypes={assignedTypes} onAdd={handleAddAgent} />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Research Teams</h3>
          <p className="font-mono text-[10px] text-muted-foreground">
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
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <Users className="h-10 w-10 text-muted-foreground/30" />
          <p className="font-mono text-xs text-muted-foreground">
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
