export type AgentStatus = "idle" | "busy" | "error"

export interface LogEntry {
  id: string
  timestamp: string
  agent: string
  type: "thought" | "action" | "result" | "error"
  message: string
  children?: LogEntry[]
}

export interface StepperStep {
  id: string
  label: string
  status: "completed" | "active" | "pending"
}

export function getAgentColor(agent: string): string {
  const colors: Record<string, string> = {
    "Paper Collector": "text-chart-1",
    "paper-collector": "text-chart-1",
    Implementer: "text-chart-2",
    implementer: "text-chart-2",
    "Research Director": "text-chart-3",
    "research-director": "text-chart-3",
    system: "text-muted-foreground",
    User: "text-primary",
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
