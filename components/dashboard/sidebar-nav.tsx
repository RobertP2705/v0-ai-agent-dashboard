"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { fetchProjects, type ResearchProject } from "@/lib/supabase"
import {
  LayoutGrid,
  MessageSquare,
  CreditCard,
  Brain,
  Activity,
  Users,
  LogOut,
  ChevronUp,
  ChevronLeft,
  BookOpen,
  Network,
  FolderOpen,
  HelpCircle,
} from "lucide-react"
import type { User } from "@supabase/supabase-js"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

// Project sub-navigation items
const projectSubNav = [
  { id: "project-overview", label: "Overview", icon: LayoutGrid },
  { id: "project-research", label: "Research", icon: Activity },
  { id: "project-graph", label: "Knowledge Graph", icon: Network },
  { id: "project-papers", label: "Papers Library", icon: BookOpen },
  { id: "project-meeting", label: "Meeting Room", icon: MessageSquare },
]

// Top-level workspace views (always visible, unscoped)
const workspaceNav = [
  { id: "research", label: "Research", icon: Activity },
  { id: "knowledge-graph", label: "Knowledge Graph", icon: Network },
  { id: "papers", label: "Papers Library", icon: BookOpen },
  { id: "meeting", label: "Meeting Room", icon: MessageSquare },
]

// Global navigation items (always visible)
const globalNav = [
  { id: "teams", label: "Teams", icon: Users },
  { id: "credits", label: "API Credits", icon: CreditCard },
]

interface SidebarNavProps {
  activeView: string
  onViewChange: (view: string) => void
  selectedProjectId: string | null
  onSelectProject: (project: ResearchProject | null) => void
  /** Called after navigation (e.g. to close mobile sheet) */
  onClose?: () => void
  /** When true, sidebar fills container (e.g. inside mobile sheet) */
  inSheet?: boolean
  /** Trigger the onboarding tour */
  onStartTour?: () => void
}

export function SidebarNav({
  activeView,
  onViewChange,
  selectedProjectId,
  onSelectProject,
  onClose,
  inSheet,
  onStartTour,
}: SidebarNavProps) {
  const [user, setUser] = useState<User | null>(null)
  const [projects, setProjects] = useState<ResearchProject[]>([])
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
    })
    loadProjects()
  }, [])

  async function loadProjects() {
    try {
      const p = await fetchProjects()
      setProjects(p)
    } catch {
      // non-fatal
    }
  }

  // Refresh project list when returning to projects landing
  useEffect(() => {
    if (activeView === "projects" && !selectedProjectId) {
      loadProjects()
    }
  }, [activeView, selectedProjectId])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  const userEmail = user?.email ?? ""
  const userAvatar = user?.user_metadata?.avatar_url as string | undefined
  const userName = user?.user_metadata?.full_name as string | undefined

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null

  return (
    <aside
      className={cn(
        "flex h-full flex-col bg-sidebar",
        inSheet ? "w-full min-w-0" : "w-[240px] shrink-0 border-r border-border",
      )}
    >
      {/* Logo header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
          <Brain className="h-4 w-4 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-sidebar-foreground">
            Swarm Lab
          </h1>
          <p className="font-mono text-[10px] text-muted-foreground">v3.0.0</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
        {/* Projects section */}
        <p
          className="mb-1 px-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
          data-tour="sidebar-projects"
        >
          Projects
        </p>

        {selectedProject ? (
          <>
            {/* Back to projects */}
            <button
              onClick={() => {
                onSelectProject(null)
                onViewChange("projects")
                onClose?.()
              }}
              className="mb-1 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              All Projects
            </button>

            {/* Selected project name */}
            <div className="mb-2 flex items-center gap-2 rounded-md bg-sidebar-accent/30 px-2.5 py-2">
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="truncate text-xs font-medium text-primary">
                {selectedProject.name}
              </span>
            </div>

            {/* Project sub-nav */}
            {projectSubNav.map((item) => {
              const Icon = item.icon
              const isActive = activeView === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onViewChange(item.id)
                    onClose?.()
                  }}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-accent font-medium text-primary"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </button>
              )
            })}
          </>
        ) : (
          <>
            {/* Projects landing link */}
            <button
              onClick={() => {
                onViewChange("projects")
                onClose?.()
              }}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                activeView === "projects"
                  ? "bg-sidebar-accent font-medium text-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              <FolderOpen className="h-4 w-4 shrink-0" />
              All Projects
            </button>

            {/* Quick-access project list */}
            {projects.length > 0 && (
              <div className="ml-2 flex flex-col gap-0.5 border-l border-border pl-2">
                {projects.slice(0, 5).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onSelectProject(p)
                      onViewChange("project-overview")
                      onClose?.()
                    }}
                    className="flex items-center gap-2 truncate rounded-md px-2 py-1.5 text-xs text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
                {projects.length > 5 && (
                  <span className="px-2 py-1 font-mono text-[10px] text-muted-foreground">
                    +{projects.length - 5} more
                  </span>
                )}
              </div>
            )}
          </>
        )}

        {/* Separator */}
        <div className="my-2 border-t border-border" />

        {/* Workspace views */}
        <p className="mb-1 px-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Workspace
        </p>
        {workspaceNav.map((item) => {
          const Icon = item.icon
          const isActive = activeView === item.id
          return (
            <button
              key={item.id}
              onClick={() => {
                onViewChange(item.id)
                onClose?.()
              }}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent font-medium text-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </button>
          )
        })}

        {/* Separator */}
        <div className="my-2 border-t border-border" />

        {/* Global nav */}
        <p
          className="mb-1 px-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
          data-tour="sidebar-global"
        >
          Global
        </p>
        {globalNav.map((item) => {
          const Icon = item.icon
          const isActive = activeView === item.id
          return (
            <button
              key={item.id}
              onClick={() => {
                onViewChange(item.id)
                onClose?.()
              }}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent font-medium text-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2 rounded-md bg-secondary/50 px-3 py-2">
          <Activity className="h-3.5 w-3.5 text-success" />
          <div>
            <p className="text-xs font-medium text-sidebar-foreground">
              System Online
            </p>
            <p className="font-mono text-[10px] text-muted-foreground">
              Qwen3-32B on A100
            </p>
          </div>
        </div>

        {/* Quick Guide button */}
        {onStartTour && (
          <button
            onClick={onStartTour}
            className="mt-2 flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            data-tour="sidebar-guide"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            Quick Guide
          </button>
        )}

        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="mt-2 flex w-full items-center gap-2.5 rounded-md border border-border px-3 py-2.5 text-left transition-colors hover:bg-sidebar-accent/50"
                aria-label="Account menu"
              >
                <Avatar className="h-7 w-7 shrink-0">
                  {userAvatar ? (
                    <AvatarImage
                      src={userAvatar}
                      alt=""
                      referrerPolicy="no-referrer"
                    />
                  ) : null}
                  <AvatarFallback className="bg-primary text-xs font-bold text-primary-foreground">
                    {(userName || userEmail || "?").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  {userName && (
                    <p className="truncate text-xs font-medium text-sidebar-foreground">
                      {userName}
                    </p>
                  )}
                  <p className="truncate font-mono text-[10px] text-muted-foreground">
                    {userEmail}
                  </p>
                </div>
                <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="start"
              sideOffset={8}
              className="w-[216px]"
            >
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  {userName && (
                    <p className="text-sm font-medium leading-none">{userName}</p>
                  )}
                  <p className="text-xs leading-none text-muted-foreground">
                    {userEmail}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={handleSignOut}
                className="cursor-pointer"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </aside>
  )
}
