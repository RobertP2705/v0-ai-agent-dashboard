"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BookOpen, Terminal, Compass, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

const AGENT_TYPES = [
  {
    id: "paper-collector",
    name: "Paper Collector",
    description: "Finds, reads, and synthesizes academic papers from arXiv and Semantic Scholar.",
    icon: BookOpen,
    color: "text-chart-1",
  },
  {
    id: "implementer",
    name: "Implementer",
    description: "Reproduces papers in code, runs in Modal sandboxes, logs to W&B, pushes to GitHub.",
    icon: Terminal,
    color: "text-chart-2",
  },
  {
    id: "research-director",
    name: "Research Director",
    description: "Identifies promising research directions, gap analysis, novelty assessment.",
    icon: Compass,
    color: "text-chart-3",
  },
] as const

interface AgentPickerProps {
  assignedTypes: string[]
  onAdd: (agentType: string) => void
}

export function AgentPicker({ assignedTypes, onAdd }: AgentPickerProps) {
  return (
    <div className="space-y-2">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Available Agent Types
      </p>
      {AGENT_TYPES.map((agent) => {
        const Icon = agent.icon
        const alreadyAdded = assignedTypes.includes(agent.id)
        return (
          <Card
            key={agent.id}
            className={cn(
              "flex items-center gap-3 border-border bg-secondary/30 px-3 py-2.5",
              alreadyAdded && "opacity-50"
            )}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary">
              <Icon className={cn("h-4 w-4", agent.color)} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground">{agent.name}</p>
              <p className="font-mono text-[10px] text-muted-foreground line-clamp-1">
                {agent.description}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={alreadyAdded}
              onClick={() => onAdd(agent.id)}
              className="h-7 w-7 p-0"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </Card>
        )
      })}
    </div>
  )
}

export { AGENT_TYPES }
