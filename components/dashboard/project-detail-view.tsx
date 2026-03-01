"use client"

import { useState, useEffect } from "react"
import {
  fetchProject,
  fetchTeams,
  type ResearchProject,
  type Team,
} from "@/lib/supabase"
import { AgentStatusGrid } from "@/components/dashboard/agent-status-grid"
import { ApiMonitor } from "@/components/dashboard/api-monitor"
import { ChatInterface } from "@/components/dashboard/chat-interface"
import { MeetingRoom } from "@/components/dashboard/meeting-room"
import { PapersView } from "@/components/dashboard/papers-view"
import { ReportsView } from "@/components/dashboard/reports-view"
import { KnowledgeGraphView } from "@/components/dashboard/knowledge-graph"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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

  if (loading || !project) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          <p className="font-mono text-xs text-muted-foreground/60">
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
      <div className="flex h-full min-h-[70vh] flex-col gap-2">
        <ProjectHeader project={project} />
        <div className="min-h-0 flex-1 overflow-hidden">
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

  if (activeSubView === "reports") {
    return (
      <div className="flex h-full flex-col gap-4">
        <ProjectHeader project={project} />
        <ReportsView projectId={projectId} teamId={project.team_id ?? undefined} />
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

  // Default: Overview (team is read-only; change team only in Teams tab)
  const currentTeam = teams.find((t) => t.id === project.team_id)

  return (
    <div className="flex min-h-full flex-col gap-4">
      <ProjectHeader project={project} />
      <Card className="border-border/80 bg-card/60 backdrop-blur-sm">
        <CardContent className="flex flex-wrap items-center gap-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <Link2 className="h-3.5 w-3.5 text-muted-foreground/60" />
            {currentTeam ? (
              <span className="flex items-center gap-1.5 font-mono text-xs text-foreground">
                <Users className="h-3 w-3 text-primary/70" />
                {currentTeam.name}
                <span className="text-muted-foreground/70">
                  ({currentTeam.team_agents?.filter((a) => a.enabled).length ?? 0} agents)
                </span>
              </span>
            ) : (
              <span className="font-mono text-xs text-muted-foreground/70">No team assigned</span>
            )}
          </div>
          <span className="font-mono text-[10px] text-muted-foreground/50">
            To change the team, go to the Teams tab.
          </span>
          {project.description && (
            <p className="w-full font-mono text-[10px] leading-relaxed text-muted-foreground/80">
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
    <div className="flex items-center gap-3 rounded-lg border border-border/80 bg-card/60 px-4 py-2.5 backdrop-blur-sm">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
        <FolderOpen className="h-3.5 w-3.5 text-primary" />
      </div>
      <span className="text-sm font-semibold tracking-tight text-foreground">
        {project.name}
      </span>
      <Badge
        variant="outline"
        className={cn(
          "ml-auto font-mono text-[9px] capitalize",
          statusColors[project.status] || statusColors.setup,
        )}
      >
        {project.status}
      </Badge>
    </div>
  )
}
