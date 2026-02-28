"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Menu } from "lucide-react"
import { SidebarNav } from "@/components/dashboard/sidebar-nav"
import { AgentStatusGrid } from "@/components/dashboard/agent-status-grid"
import { ApiMonitor } from "@/components/dashboard/api-monitor"
import { ChatInterface } from "@/components/dashboard/chat-interface"
import { MeetingRoom } from "@/components/dashboard/meeting-room"
import { ApiCreditsView } from "@/components/dashboard/api-credits-view"
import { TeamsView } from "@/components/dashboard/teams-view"
import { useIsMobile } from "@/components/ui/use-mobile"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import type { User } from "@supabase/supabase-js"

export function DashboardShell() {
  const [activeView, setActiveView] = useState("overview")
  const [user, setUser] = useState<User | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isMobile = useIsMobile()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
    })
  }, [])

  const userName =
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email?.split("@")[0] ??
    "Researcher"

  const sidebarContent = (
    <SidebarNav
      activeView={activeView}
      onViewChange={setActiveView}
      onClose={() => setSidebarOpen(false)}
      inSheet={isMobile}
    />
  )

  return (
    <div className="flex min-h-dvh h-dvh max-h-dvh w-full overflow-hidden">
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
              <h2 className="truncate text-sm font-semibold text-foreground">
                {activeView === "overview" && "Swarm Overview"}
                {activeView === "research" && "Research Console"}
                {activeView === "teams" && "Research Teams"}
                {activeView === "meeting" && "Research Meeting Room"}
                {activeView === "credits" && "API Credits"}
              </h2>
              <p className="truncate font-mono text-[10px] text-muted-foreground">
                {activeView === "overview" &&
                  "Real-time agent monitoring and research console"}
                {activeView === "research" &&
                  "Full-screen research console with live agent monitoring"}
                {activeView === "teams" &&
                  "Create teams and assign specialized research agents"}
                {activeView === "meeting" &&
                  "Multi-agent discussion with voice synthesis"}
                {activeView === "credits" &&
                  "Token usage, cost tracking, and integrations"}
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
          {activeView === "overview" && <OverviewView userName={userName} />}
          {activeView === "research" && (
            <div className="h-full">
              <ChatInterface fullscreen />
            </div>
          )}
          {activeView === "teams" && <TeamsView />}
          {activeView === "meeting" && <MeetingRoom />}
          {activeView === "credits" && <ApiCreditsView userEmail={user?.email} />}
        </div>
      </main>
    </div>
  )
}

function OverviewView({ userName }: { userName: string }) {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="rounded-md border border-border bg-card/80 px-4 py-3">
        <p className="text-sm text-foreground">
          {"Welcome back, "}
          <span className="font-semibold text-primary">{userName}</span>
        </p>
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          Your research swarm is active and monitoring.
        </p>
      </div>
      <AgentStatusGrid />
      <ApiMonitor />
      <div className="min-h-0 flex-1">
        <ChatInterface />
      </div>
    </div>
  )
}
