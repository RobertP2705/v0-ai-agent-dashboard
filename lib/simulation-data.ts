export type AgentStatus = "idle" | "busy" | "error"

export interface AgentInfo {
  id: string
  name: string
  status: AgentStatus
  task: string
  cpuHistory: number[]
  memoryHistory: number[]
  cpuCurrent: number
  memoryCurrent: number
}

export interface LogEntry {
  id: string
  timestamp: string
  agent: string
  type: "thought" | "action" | "result" | "error"
  message: string
  children?: LogEntry[]
}

export interface TokenUsagePoint {
  time: string
  input: number
  output: number
}

export interface StepperStep {
  id: string
  label: string
  status: "completed" | "active" | "pending"
}

export function generateAgents(): AgentInfo[] {
  return [
    {
      id: "paper-finder",
      name: "Paper Finder",
      status: "busy",
      task: "Searching arXiv for transformer attention papers",
      cpuHistory: Array.from({ length: 20 }, () => 30 + Math.random() * 50),
      memoryHistory: Array.from({ length: 20 }, () => 40 + Math.random() * 30),
      cpuCurrent: 67,
      memoryCurrent: 54,
    },
    {
      id: "coder",
      name: "Coder",
      status: "idle",
      task: "Awaiting implementation task from Paper Finder",
      cpuHistory: Array.from({ length: 20 }, () => 5 + Math.random() * 15),
      memoryHistory: Array.from({ length: 20 }, () => 20 + Math.random() * 15),
      cpuCurrent: 12,
      memoryCurrent: 28,
    },
    {
      id: "tester",
      name: "Tester",
      status: "error",
      task: "Retry: benchmark suite failed on CUDA OOM",
      cpuHistory: Array.from({ length: 20 }, () => 10 + Math.random() * 20),
      memoryHistory: Array.from({ length: 20 }, () => 60 + Math.random() * 30),
      cpuCurrent: 8,
      memoryCurrent: 91,
    },
  ]
}

export function generateLogs(): LogEntry[] {
  return [
    {
      id: "log-1",
      timestamp: "14:23:01",
      agent: "Paper Finder",
      type: "thought",
      message: "Starting literature search for multi-head attention optimization techniques",
      children: [
        {
          id: "log-1-1",
          timestamp: "14:23:03",
          agent: "Paper Finder",
          type: "action",
          message: "Query: arXiv API -> 'multi-head attention efficient transformers 2025'",
        },
        {
          id: "log-1-2",
          timestamp: "14:23:08",
          agent: "Paper Finder",
          type: "result",
          message: "Found 47 papers. Filtering by citation count > 50...",
        },
        {
          id: "log-1-3",
          timestamp: "14:23:12",
          agent: "Paper Finder",
          type: "result",
          message: "12 papers match criteria. Top result: 'FlashAttention-3: Fast and Exact Attention'",
        },
      ],
    },
    {
      id: "log-2",
      timestamp: "14:23:15",
      agent: "Coder",
      type: "thought",
      message: "Received paper summary from Paper Finder. Analyzing code requirements...",
      children: [
        {
          id: "log-2-1",
          timestamp: "14:23:18",
          agent: "Coder",
          type: "action",
          message: "Generating implementation plan for FlashAttention-3 kernel",
        },
      ],
    },
    {
      id: "log-3",
      timestamp: "14:23:22",
      agent: "Tester",
      type: "error",
      message: "CUDA OOM: Benchmark failed. Reducing batch size from 64 to 32 and retrying...",
      children: [
        {
          id: "log-3-1",
          timestamp: "14:23:25",
          agent: "Tester",
          type: "action",
          message: "Clearing GPU cache and re-allocating memory pool",
        },
      ],
    },
  ]
}

export function generateTokenUsage(): TokenUsagePoint[] {
  const points: TokenUsagePoint[] = []
  for (let i = 0; i < 24; i++) {
    points.push({
      time: `${String(i).padStart(2, "0")}:00`,
      input: Math.floor(800 + Math.random() * 2400),
      output: Math.floor(400 + Math.random() * 1200),
    })
  }
  return points
}

export function generateSteps(): StepperStep[] {
  return [
    { id: "search", label: "Literature Search", status: "completed" },
    { id: "filter", label: "Relevance Filtering", status: "completed" },
    { id: "analyze", label: "Deep Analysis", status: "active" },
    { id: "implement", label: "Code Generation", status: "pending" },
    { id: "test", label: "Benchmark Testing", status: "pending" },
  ]
}

export function getAgentColor(agent: string): string {
  const colors: Record<string, string> = {
    "Paper Finder": "text-chart-1",
    Coder: "text-chart-2",
    Tester: "text-chart-4",
  }
  return colors[agent] || "text-foreground"
}

export function getStatusColor(status: AgentStatus): string {
  switch (status) {
    case "idle":
      return "bg-info/20 text-info border-info/30"
    case "busy":
      return "bg-success/20 text-success border-success/30"
    case "error":
      return "bg-destructive/20 text-destructive border-destructive/30"
  }
}
