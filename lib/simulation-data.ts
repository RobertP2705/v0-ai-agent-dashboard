export type AgentStatus = "idle" | "busy" | "error"

export interface LogEntry {
  id: string
  timestamp: string
  agent: string
  type: "thought" | "action" | "result" | "error"
  message: string
  meta?: Record<string, unknown>
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
    "PDF Report Writer": "text-chart-4",
    "pdf-agent": "text-chart-4",
    system: "text-muted-foreground",
    User: "text-primary",
  }
  if (colors[agent]) return colors[agent]
  const base = agent.replace(/ #\d+$/, "")
  return colors[base] || "text-foreground"
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
