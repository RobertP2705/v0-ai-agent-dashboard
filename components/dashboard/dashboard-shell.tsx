"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Menu } from "lucide-react"
import { SidebarNav } from "@/components/dashboard/sidebar-nav"
import { ChatInterface } from "@/components/dashboard/chat-interface"
import { AgentStatusGrid } from "@/components/dashboard/agent-status-grid"
import { KnowledgeGraphView } from "@/components/dashboard/knowledge-graph"
import { PapersView } from "@/components/dashboard/papers-view"
import { MeetingRoom } from "@/components/dashboard/meeting-room"
import { ApiCreditsView } from "@/components/dashboard/api-credits-view"
import { TeamsView } from "@/components/dashboard/teams-view"
import { ProjectsLanding } from "@/components/dashboard/projects-landing"
import { ProjectDetailView } from "@/components/dashboard/project-detail-view"
import { OnboardingTour } from "@/components/dashboard/onboarding-tour"
import { StreamingProvider } from "@/lib/streaming-context"
import { useIsMobile } from "@/components/ui/use-mobile"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import type { User } from "@supabase/supabase-js"
import type { ResearchProject } from "@/lib/supabase"

// View title/description map
const viewMeta: Record<string, { title: string; description: string }> = {
  projects: {
    title: "Research Projects",
    description: "Manage and organize your research projects",
  },
  "project-overview": {
    title: "Project Overview",
    description: "Real-time agent monitoring and research console",
  },
  "project-research": {
    title: "Research Console",
    description: "Full-screen research console with live agent monitoring",
  },
  "project-graph": {
    title: "Knowledge Graph",
    description: "Visualize memories, papers, and connections",
  },
  "project-papers": {
    title: "Papers Library",
    description: "Browse and search collected research papers",
  },
  "project-meeting": {
    title: "Research Meeting Room",
    description: "Multi-agent discussion with voice synthesis",
  },
  research: {
    title: "Research Console",
    description: "Full-screen research console with live agent monitoring",
  },
  "knowledge-graph": {
    title: "Knowledge Graph",
    description: "Visualize memories, papers, and connections",
  },
  papers: {
    title: "Papers Library",
    description: "Browse and search collected research papers",
  },
  meeting: {
    title: "Meeting Room",
    description: "Multi-agent discussion with voice synthesis",
  },
  teams: {
    title: "Research Teams",
    description: "Create teams and assign specialized research agents",
  },
  credits: {
    title: "API Credits",
    description: "Token usage, cost tracking, and integrations",
  },
}

export function DashboardShell() {
  const [activeView, setActiveView] = useState("projects")
  const [selectedProject, setSelectedProject] = useState<ResearchProject | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [tourActive, setTourActive] = useState(false)
  const isMobile = useIsMobile()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)

      // Check if this is a first-time user (no tour_completed flag)
      if (user) {
        const tourKey = `swarm-lab-tour-completed-${user.id}`
        if (!localStorage.getItem(tourKey)) {
          // Delay tour start slightly so UI renders first
          setTimeout(() => setTourActive(true), 800)
        }
      }
    })
  }, [])

  const handleSelectProject = useCallback((project: ResearchProject | null) => {
    setSelectedProject(project)
    if (project) {
      setActiveView("project-overview")
    } else {
      setActiveView("projects")
    }
  }, [])

  const handleStartTour = useCallback(() => {
    setTourActive(true)
  }, [])

  const handleFinishTour = useCallback(() => {
    setTourActive(false)
    if (user) {
      const tourKey = `swarm-lab-tour-completed-${user.id}`
      localStorage.setItem(tourKey, "true")
    }
  }, [user])

  const meta = viewMeta[activeView] ?? viewMeta.projects

  const sidebarContent = (
    <SidebarNav
      activeView={activeView}
      onViewChange={setActiveView}
      selectedProjectId={selectedProject?.id ?? null}
      onSelectProject={handleSelectProject}
      onClose={() => setSidebarOpen(false)}
      inSheet={isMobile}
      onStartTour={handleStartTour}
    />
  )

  return (
    <StreamingProvider>
      <div className="flex h-dvh w-full overflow-hidden">
        {!isMobile && sidebarContent}

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2 sm:px-6 sm:py-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
              {isMobile && (
                <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      aria-label="Open menu"
                    >
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent
                    side="left"
                    className="flex w-[280px] max-w-[85vw] flex-col border-r border-border p-0"
                  >
                    {sidebarContent}
                  </SheetContent>
                </Sheet>
              )}
              <div className="min-w-0 flex-1">
                <h2
                  className="truncate text-sm font-semibold text-foreground"
                  data-tour="header-title"
                >
                  {meta.title}
                </h2>
                <p className="truncate font-mono text-[10px] text-muted-foreground">
                  {meta.description}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              {user && (
                <span className="hidden max-w-[120px] truncate font-mono text-[10px] text-muted-foreground sm:block sm:max-w-[180px]">
                  {user.email}
                </span>
              )}
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  Live
                </span>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-auto p-2 sm:p-4">
            {/* Projects landing page */}
            {activeView === "projects" && (
              <ProjectsLanding onSelectProject={handleSelectProject} />
            )}

            {/* Project detail sub-views */}
            {activeView.startsWith("project-") && selectedProject && (
              <div className="h-full">
                <ProjectDetailView
                  projectId={selectedProject.id}
                  activeSubView={activeView.replace("project-", "")}
                />
              </div>
            )}

            {/* Workspace views (global, unscoped) */}
            {activeView === "research" && (
              <div className="flex h-full flex-col gap-4 lg:flex-row">
                <div className="flex-1"><ChatInterface fullscreen /></div>
                <div className="w-full lg:w-[340px]"><AgentStatusGrid /></div>
              </div>
            )}
            {activeView === "knowledge-graph" && <KnowledgeGraphView />}
            {activeView === "papers" && <PapersView />}
            {activeView === "meeting" && <MeetingRoom />}

            {/* Global views */}
            {activeView === "teams" && <TeamsView />}
            {activeView === "credits" && (
              <ApiCreditsView userEmail={user?.email} />
            )}
          </div>
        </main>
      </div>

      {/* Onboarding Tour */}
      <OnboardingTour active={tourActive} onFinish={handleFinishTour} />
    </StreamingProvider>
  )
}
