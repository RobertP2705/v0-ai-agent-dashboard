"use client"

import { type Dispatch, type SetStateAction, useEffect, useState } from "react"
import {
  createProject,
  deleteProject,
  fetchTeams,
  type ResearchProject,
  type Team,
} from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Plus,
  FolderOpen,
  Trash2,
  Users,
  Beaker,
  ArrowRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { getTeamAgentsSnippet } from "@/components/dashboard/team-card"

interface ProjectsLandingProps {
  onSelectProject: (project: ResearchProject) => void
  projects: ResearchProject[]
  setProjects: Dispatch<SetStateAction<ResearchProject[]>>
  projectsLoaded: boolean
}

const statusColors: Record<string, string> = {
  active: "bg-success/20 text-success border-success/30",
  setup: "bg-warning/20 text-warning border-warning/30",
  paused: "bg-muted text-muted-foreground border-border",
  completed: "bg-info/20 text-info border-info/30",
}

export function ProjectsLanding({ onSelectProject, projects, setProjects, projectsLoaded }: ProjectsLandingProps) {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [newTeamId, setNewTeamId] = useState<string>("")
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadTeams()
  }, [])

  async function loadTeams() {
    setLoading(true)
    try {
      const t = await fetchTeams()
      setTeams(t)
    } catch (err) {
      console.error("Failed to load teams:", err)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const project = await createProject(
        newName.trim(),
        newDescription.trim(),
        newTeamId && newTeamId !== "none" ? newTeamId : undefined,
      )
      setProjects((prev) => [project, ...prev])
      setNewName("")
      setNewDescription("")
      setNewTeamId("")
      setDialogOpen(false)
    } catch (err) {
      console.error("Failed to create project:", err)
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteProject(id)
      setProjects((prev) => prev.filter((p) => p.id !== id))
    } catch (err) {
      console.error("Failed to delete project:", err)
    }
  }

  if (loading || !projectsLoaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="font-mono text-xs text-muted-foreground">
            Loading projects...
          </p>
        </div>
      </div>
    )
  }

  // Empty state for first-time users
  if (projects.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="flex max-w-md flex-col items-center gap-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card">
            <Beaker className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h2 className="text-balance text-lg font-semibold text-foreground">
              Create your first research project
            </h2>
            <p className="mt-2 text-pretty font-mono text-xs text-muted-foreground">
              Projects organize your research tasks, papers, and teams in one
              place. Create a project to get started with your AI research swarm.
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                New Project
              </Button>
            </DialogTrigger>
            <CreateProjectDialog
              teams={teams}
              newName={newName}
              setNewName={setNewName}
              newDescription={newDescription}
              setNewDescription={setNewDescription}
              newTeamId={newTeamId}
              setNewTeamId={setNewTeamId}
              creating={creating}
              handleCreate={handleCreate}
            />
          </Dialog>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Research Projects
          </h2>
          <p className="font-mono text-[10px] text-muted-foreground">
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              New Project
            </Button>
          </DialogTrigger>
          <CreateProjectDialog
            teams={teams}
            newName={newName}
            setNewName={setNewName}
            newDescription={newDescription}
            setNewDescription={setNewDescription}
            newTeamId={newTeamId}
            setNewTeamId={setNewTeamId}
            creating={creating}
            handleCreate={handleCreate}
          />
        </Dialog>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onSelect={onSelectProject}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  )
}

function ProjectCard({
  project,
  onSelect,
  onDelete,
}: {
  project: ResearchProject
  onSelect: (project: ResearchProject) => void
  onDelete: (id: string) => void
}) {
  return (
    <Card
      className="group cursor-pointer border-border bg-card/80 backdrop-blur-sm transition-colors hover:border-primary/40"
      onClick={() => onSelect(project)}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
            <FolderOpen className="h-3.5 w-3.5 text-primary" />
          </div>
          <CardTitle className="text-sm font-medium">{project.name}</CardTitle>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(project.id)
            }}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {project.description && (
          <p className="font-mono text-[10px] text-muted-foreground line-clamp-2">
            {project.description}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant="outline"
            className={cn(
              "font-mono text-[9px] capitalize",
              statusColors[project.status] || statusColors.setup,
            )}
          >
            {project.status}
          </Badge>
          {project.team && (
            <Badge
              variant="outline"
              className="gap-1 font-mono text-[9px] text-muted-foreground"
            >
              <Users className="h-3 w-3" />
              {typeof project.team === "object" && "name" in project.team
                ? project.team.name
                : "Team"}
            </Badge>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-muted-foreground">
            Updated{" "}
            {new Date(project.updated_at).toLocaleDateString()}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function CreateProjectDialog({
  teams,
  newName,
  setNewName,
  newDescription,
  setNewDescription,
  newTeamId,
  setNewTeamId,
  creating,
  handleCreate,
}: {
  teams: Team[]
  newName: string
  setNewName: (v: string) => void
  newDescription: string
  setNewDescription: (v: string) => void
  newTeamId: string
  setNewTeamId: (v: string) => void
  creating: boolean
  handleCreate: () => void
}) {
  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>New Research Project</DialogTitle>
        <DialogDescription>
          Create a project to organize your research tasks, papers, and agent
          teams.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4 py-4">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="project-name"
            className="font-mono text-xs text-muted-foreground"
          >
            Project name
          </label>
          <Input
            id="project-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g., Transformer Architecture Research"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate()
            }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label
            htmlFor="project-description"
            className="font-mono text-xs text-muted-foreground"
          >
            Description (optional)
          </label>
          <Textarea
            id="project-description"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Brief description of this research project..."
            rows={3}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label
            htmlFor="project-team"
            className="font-mono text-xs text-muted-foreground"
          >
            Assign team (optional)
          </label>
          <Select value={newTeamId} onValueChange={setNewTeamId}>
            <SelectTrigger id="project-team">
              <SelectValue placeholder="No team selected" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No team</SelectItem>
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  <span className="block truncate" title={getTeamAgentsSnippet(team)}>
                    {team.name} — {getTeamAgentsSnippet(team)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
          {creating ? "Creating..." : "Create Project"}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
