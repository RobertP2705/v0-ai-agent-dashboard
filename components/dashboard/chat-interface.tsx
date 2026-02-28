"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  ChevronRight,
  Send,
  Brain,
  AlertTriangle,
  CheckCircle2,
  Cog,
  Lightbulb,
} from "lucide-react"
import { StatusStepper } from "./status-stepper"
import type { LogEntry, StepperStep } from "@/lib/simulation-data"
import { generateLogs, generateSteps, getAgentColor } from "@/lib/simulation-data"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const typeIcons: Record<string, React.ElementType> = {
  thought: Lightbulb,
  action: Cog,
  result: CheckCircle2,
  error: AlertTriangle,
}

const typeColors: Record<string, string> = {
  thought: "text-chart-3",
  action: "text-chart-2",
  result: "text-success",
  error: "text-destructive",
}

function LogItem({ entry, depth = 0 }: { entry: LogEntry; depth?: number }) {
  const [open, setOpen] = useState(depth === 0)
  const Icon = typeIcons[entry.type] || Brain
  const hasChildren = entry.children && entry.children.length > 0

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            "group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-secondary/50",
            depth > 0 && "ml-4 border-l border-border pl-3"
          )}
        >
          {hasChildren && (
            <ChevronRight
              className={cn(
                "mt-0.5 h-3 w-3 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-90"
              )}
            />
          )}
          {!hasChildren && <span className="w-3 shrink-0" />}
          <Icon className={cn("mt-0.5 h-3 w-3 shrink-0", typeColors[entry.type])} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-muted-foreground">
                {entry.timestamp}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  "font-mono text-[9px] px-1 py-0",
                  getAgentColor(entry.agent)
                )}
              >
                {entry.agent}
              </Badge>
            </div>
            <p className="mt-0.5 font-mono text-xs text-foreground/90 leading-relaxed">
              {entry.message}
            </p>
          </div>
        </button>
      </CollapsibleTrigger>
      {hasChildren && (
        <CollapsibleContent>
          <div className="space-y-0.5">
            {entry.children!.map((child) => (
              <LogItem key={child.id} entry={child} depth={depth + 1} />
            ))}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}

export function ChatInterface() {
  const { data: dbLogs } = useSWR("/api/chat-logs", fetcher, {
    refreshInterval: 4000,
    fallbackData: null,
  })

  const [localLogs, setLocalLogs] = useState<LogEntry[]>([])
  const [steps, setSteps] = useState<StepperStep[]>(generateSteps)
  const [inputValue, setInputValue] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const initializedRef = useRef(false)

  // Merge DB logs with local streaming logs
  useEffect(() => {
    if (dbLogs && Array.isArray(dbLogs) && dbLogs.length > 0 && !initializedRef.current) {
      initializedRef.current = true
      const mapped: LogEntry[] = dbLogs.map((log: Record<string, unknown>) => ({
        id: log.id as string,
        timestamp: log.timestamp as string,
        agent: log.agent as string,
        type: log.type as LogEntry["type"],
        message: log.message as string,
        children: Array.isArray(log.children)
          ? (log.children as Array<Record<string, unknown>>).map((c) => ({
              id: c.id as string,
              timestamp: c.timestamp as string,
              agent: c.agent as string,
              type: c.type as LogEntry["type"],
              message: c.message as string,
            }))
          : undefined,
      }))
      setLocalLogs(mapped)
    } else if (!dbLogs && !initializedRef.current) {
      setLocalLogs(generateLogs())
      initializedRef.current = true
    }
  }, [dbLogs])

  const addStreamingLog = useCallback(() => {
    const agents = ["Paper Finder", "Coder", "Tester"]
    const types: ("thought" | "action" | "result")[] = ["thought", "action", "result"]
    const messages = [
      "Evaluating relevance score for document batch #47...",
      "Parsing abstract with NER model for key concepts",
      "Cross-referencing citation graph with existing corpus",
      "Generating embedding vectors for semantic search",
      "Running type-check pass on generated kernel code",
      "Compiling benchmark suite with CUDA 12.4 toolkit",
      "Profiling memory allocation patterns for optimization",
    ]

    const newLog: LogEntry = {
      id: `stream-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      agent: agents[Math.floor(Math.random() * agents.length)],
      type: types[Math.floor(Math.random() * types.length)],
      message: messages[Math.floor(Math.random() * messages.length)],
    }

    setLocalLogs((prev) => [...prev.slice(-30), newLog])

    // Persist to Supabase in the background
    fetch("/api/chat-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newLog),
    }).catch(() => {})
  }, [])

  useEffect(() => {
    setIsStreaming(true)
    const interval = setInterval(addStreamingLog, 3000)
    return () => clearInterval(interval)
  }, [addStreamingLog])

  useEffect(() => {
    const stepTimer = setInterval(() => {
      setSteps((prev) => {
        const activeIdx = prev.findIndex((s) => s.status === "active")
        if (activeIdx === -1 || activeIdx >= prev.length - 1) {
          return generateSteps()
        }
        return prev.map((s, i) => ({
          ...s,
          status:
            i <= activeIdx
              ? "completed"
              : i === activeIdx + 1
                ? "active"
                : "pending",
        })) as StepperStep[]
      })
    }, 8000)
    return () => clearInterval(stepTimer)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim()) return
    const userLog: LogEntry = {
      id: `user-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      agent: "User",
      type: "action",
      message: inputValue,
    }
    setLocalLogs((prev) => [...prev, userLog])
    setInputValue("")

    // Persist to Supabase
    fetch("/api/chat-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userLog),
    }).catch(() => {})
  }

  return (
    <Card className="flex h-full flex-col border-border bg-card/80 backdrop-blur-sm">
      <CardHeader className="space-y-3 border-b border-border pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Brain className="h-3.5 w-3.5 text-primary" />
            Chain of Thought
          </CardTitle>
          {isStreaming && (
            <Badge
              variant="outline"
              className="animate-pulse border-success/30 bg-success/10 font-mono text-[10px] text-success"
            >
              STREAMING
            </Badge>
          )}
        </div>
        <StatusStepper steps={steps} />
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <ScrollArea className="flex-1 p-3" ref={scrollRef}>
          <div className="space-y-1">
            {localLogs.map((log) => (
              <LogItem key={log.id} entry={log} />
            ))}
          </div>
        </ScrollArea>
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 border-t border-border p-3"
        >
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Send a command to the swarm..."
            className="flex-1 rounded-md border border-border bg-secondary px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="submit"
            className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/80"
            aria-label="Send command"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>
      </CardContent>
    </Card>
  )
}
