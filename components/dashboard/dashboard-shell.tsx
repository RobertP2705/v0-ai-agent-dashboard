"use client"

import { useState } from "react"
import useSWR from "swr"
import { SidebarNav } from "@/components/dashboard/sidebar-nav"
import { AgentStatusGrid } from "@/components/dashboard/agent-status-grid"
import { ApiMonitor } from "@/components/dashboard/api-monitor"
import { ChatInterface } from "@/components/dashboard/chat-interface"
import { MeetingRoom } from "@/components/dashboard/meeting-room"
import { ApiCreditsView } from "@/components/dashboard/api-credits-view"
import { generateAgents } from "@/lib/simulation-data"
import type { AgentInfo } from "@/lib/simulation-data"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const fallbackAgents = generateAgents()

function mapDbAgents(dbAgents: Array<Record<string, unknown>>): AgentInfo[] {
  return dbAgents.map((a) => ({
    id: a.id as string,
    name: a.name as string,
    status: a.status as AgentInfo["status"],
    task: a.task as string,
    cpuCurrent: a.cpu_current as number,
    memoryCurrent: a.memory_current as number,
    cpuHistory: Array.from({ length: 20 }, () => Math.max(0, (a.cpu_current as number) + (Math.random() - 0.5) * 20)),
    memoryHistory: Array.from({ length: 20 }, () => Math.max(0, (a.memory_current as number) + (Math.random() - 0.5) * 15)),
  }))
}

export function DashboardShell() {
  const [activeView, setActiveView] = useState("overview")

  const { data: dbAgents } = useSWR("/api/agents", fetcher, {
    refreshInterval: 5000,
    fallbackData: null,
  })

  const agents = dbAgents && Array.isArray(dbAgents) && dbAgents.length > 0
    ? mapDbAgents(dbAgents)
    : fallbackAgents

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarNav activeView={activeView} onViewChange={setActiveView} />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between border-b border-border px-6 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {activeView === "overview" && "Swarm Overview"}
              {activeView === "meeting" && "Research Meeting Room"}
              {activeView === "credits" && "API Credits"}
            </h2>
            <p className="font-mono text-[10px] text-muted-foreground">
              {activeView === "overview" &&
                "Real-time agent monitoring and chain-of-thought logs"}
              {activeView === "meeting" &&
                "Multi-agent discussion with voice synthesis"}
              {activeView === "credits" &&
                "Token usage, cost tracking, and integrations"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {dbAgents ? "Live (Supabase)" : "Live (Local)"}
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4">
          {activeView === "overview" && <OverviewView agents={agents} />}
          {activeView === "meeting" && <MeetingRoom />}
          {activeView === "credits" && <ApiCreditsView />}
        </div>
      </main>
    </div>
  )
}

function OverviewView({ agents }: { agents: AgentInfo[] }) {
  return (
    <div className="flex h-full flex-col gap-4">
      <AgentStatusGrid agents={agents} />
      <ApiMonitor />
      <div className="min-h-0 flex-1">
        <ChatInterface />
      </div>
    </div>
  )
}
