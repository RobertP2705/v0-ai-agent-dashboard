"use client"

import { useState } from "react"
import useSWR from "swr"
import { SidebarNav } from "@/components/dashboard/sidebar-nav"
import { AgentStatusGrid } from "@/components/dashboard/agent-status-grid"
import { ApiMonitor } from "@/components/dashboard/api-monitor"
import { ChatInterface } from "@/components/dashboard/chat-interface"
import { MeetingRoom } from "@/components/dashboard/meeting-room"
import { ApiCreditsView } from "@/components/dashboard/api-credits-view"
import type { AgentInfo } from "@/lib/simulation-data"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function getStaticFallbackAgents(): AgentInfo[] {
  return [
    {
      id: "paper-finder",
      name: "Paper Finder",
      status: "busy",
      task: "Searching arXiv for transformer attention papers",
      cpuHistory: Array(20).fill(50),
      memoryHistory: Array(20).fill(45),
      cpuCurrent: 67,
      memoryCurrent: 54,
    },
    {
      id: "coder",
      name: "Coder",
      status: "idle",
      task: "Awaiting implementation task from Paper Finder",
      cpuHistory: Array(20).fill(12),
      memoryHistory: Array(20).fill(28),
      cpuCurrent: 12,
      memoryCurrent: 28,
    },
    {
      id: "tester",
      name: "Tester",
      status: "error",
      task: "Retry: benchmark suite failed on CUDA OOM",
      cpuHistory: Array(20).fill(15),
      memoryHistory: Array(20).fill(75),
      cpuCurrent: 8,
      memoryCurrent: 91,
    },
  ]
}

function mapDbAgents(dbAgents: Array<Record<string, unknown>>): AgentInfo[] {
  return dbAgents.map((a) => {
    const cpu = a.cpu_current as number
    const mem = a.memory_current as number
    return {
      id: a.id as string,
      name: a.name as string,
      status: a.status as AgentInfo["status"],
      task: a.task as string,
      cpuCurrent: cpu,
      memoryCurrent: mem,
      cpuHistory: Array(20).fill(cpu),
      memoryHistory: Array(20).fill(mem),
    }
  })
}

export function DashboardShell() {
  const [activeView, setActiveView] = useState("overview")

  const { data: dbAgents } = useSWR("/api/agents", fetcher, {
    refreshInterval: 5000,
    fallbackData: null,
  })

  const agents = dbAgents && Array.isArray(dbAgents) && dbAgents.length > 0
    ? mapDbAgents(dbAgents)
    : getStaticFallbackAgents()

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
