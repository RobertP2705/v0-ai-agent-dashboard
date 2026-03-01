"use client"

import { useState, useEffect } from "react"
import {
  fetchProject,
  updateProject,
  fetchTeams,
  type ResearchProject,
  type Team,
} from "@/lib/supabase"
import { AgentStatusGrid } from "@/components/dashboard/agent-status-grid"
import { ApiMonitor } from "@/components/dashboard/api-monitor"
import { ChatInterface } from "@/components/dashboard/chat-interface"
import { MeetingRoom } from "@/components/dashboard/meeting-room"
import { PapersView } from "@/components/dashboard/papers-view"
import { KnowledgeGraphView } from "@/components/dashboard/knowledge-graph"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Users, FolderOpen, Link2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface ProjectDetailViewProps {
  projectId: string
  activeSubView: string
}

const statusColors: Record<string, string> = {
  active: "bg-success/20 text-success border-success/30",
  setup: "bg-warning/20 text-warning border-warning/30",
  paused: "bg-muted text-muted-foreground border-border",
  completed: "bg-info/20 text-info border-info/30",
}

export function ProjectDetailView({
  projectId,
  activeSubView,
}: ProjectDetailViewProps) {
  const [project, setProject] = useState<ResearchProject | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProject()
  }, [projectId])

  async function loadProject() {
    setLoading(true)
    try {
      const [p, t] = await Promise.all([fetchProject(projectId), fetchTeams()])
      setProject(p)
      setTeams(t)
    } catch (err) {
      console.error("Failed to load project:", err)
    } finally {
      setLoading(false)
    }
  }

  async function handleTeamChange(teamId: string) {
    if (!project) return
    try {
      const updated = await updateProject(project.id, {
        team_id: teamId === "none" ? null : teamId,
      })
      setProject(updated)
    } catch (err) {
      console.error("Failed to update team:", err)
    }
  }

  if (loading || !project) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="font-mono text-xs text-muted-foreground">
            Loading project...
          </p>
        </div>
      </div>
    )
  }

  // Render the active sub-view
  if (activeSubView === "research") {
    return (
      <div className="flex h-full flex-col gap-4">
        <ProjectHeader project={project} />
        <div className="min-h-0 flex-1">
          <ChatInterface
            fullscreen
            projectId={project.id}
            teamId={project.team_id ?? undefined}
          />
        </div>
      </div>
    )
  }

  if (activeSubView === "graph") {
    return (
      <div className="flex h-full min-h-[500px] flex-col gap-4">
        <ProjectHeader project={project} />
        <div className="min-h-0 flex-1">
          <KnowledgeGraphView projectId={project.id} />
        </div>
      </div>
    )
  }

  if (activeSubView === "papers") {
    return (
      <div className="flex h-full flex-col gap-4">
        <ProjectHeader project={project} />
        <PapersView />
      </div>
    )
  }

  if (activeSubView === "meeting") {
    return (
      <div className="flex h-full flex-col gap-4">
        <ProjectHeader project={project} />
        <MeetingRoom projectId={project.id} teamId={project.team_id ?? undefined} />
      </div>
    )
  }

  // Default: Overview
  const currentTeam = teams.find((t) => t.id === project.team_id)

  return (
    <div className="flex min-h-full flex-col gap-4">
      <ProjectHeader project={project} />
      <Card className="border-border bg-card/80 backdrop-blur-sm">
        <CardContent className="flex flex-wrap items-center gap-4 py-3">
          <div className="flex items-center gap-2">
            <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
            <Select
              value={project.team_id ?? "none"}
              onValueChange={handleTeamChange}
            >
              <SelectTrigger className="h-7 w-[180px] text-xs">
                <SelectValue placeholder="Assign team..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No team</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="flex items-center gap-1.5">
                      <Users className="h-3 w-3" />
                      {t.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {currentTeam && (
            <span className="font-mono text-[10px] text-muted-foreground">
              {currentTeam.team_agents?.filter((a) => a.enabled).length ?? 0} agents configured
            </span>
          )}
          {project.description && (
            <p className="w-full font-mono text-[10px] text-muted-foreground">
              {project.description}
            </p>
          )}
        </CardContent>
      </Card>
      <AgentStatusGrid projectId={project.id} teamId={project.team_id ?? undefined} />
      <ApiMonitor projectId={project.id} teamId={project.team_id ?? undefined} />
    </div>
  )
}

function ProjectHeader({ project }: { project: ResearchProject }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card/80 px-4 py-2">
      <FolderOpen className="h-4 w-4 text-primary" />
      <span className="text-sm font-medium text-foreground">
        {project.name}
      </span>
      <Badge
        variant="outline"
        className={cn(
          "ml-1 font-mono text-[9px] capitalize",
          statusColors[project.status] || statusColors.setup,
        )}
      >
        {project.status}
      </Badge>
    </div>
  )
}
