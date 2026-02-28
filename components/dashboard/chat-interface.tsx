"use client"

import { useState, useEffect, useRef, useCallback } from "react"
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
  ChevronDown,
  Send,
  Square,
  Brain,
  AlertTriangle,
  CheckCircle2,
  Cog,
  Lightbulb,
  Loader2,
  User,
} from "lucide-react"
import { StatusStepper } from "./status-stepper"
import type { LogEntry, StepperStep } from "@/lib/simulation-data"
import { getAgentColor } from "@/lib/simulation-data"
import { streamResearch, cancelTask, type SwarmEvent } from "@/lib/swarm-client"
import {
  supabaseConfigured,
  fetchTasks,
  fetchTaskEvents,
  fetchTeams,
  type TaskRow,
  type TaskEventRow,
  type Team,
} from "@/lib/supabase"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// ── Types ─────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string
  type: "user" | "task"
  query: string
  taskId?: string
  status: "pending" | "streaming" | "completed" | "error"
  summary: string
  events: LogEntry[]
  timestamp: string
}

// ── Helpers ───────────────────────────────────────────────────────────────

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

function formatTime(ts?: string | number): string {
  const d = ts ? new Date(typeof ts === "number" ? ts * 1000 : ts) : new Date()
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function swarmEventToLog(event: SwarmEvent): LogEntry {
  return {
    id: `ev-${event.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: formatTime(event.timestamp),
    agent: event.agent,
    type: event.type === "done" ? "result" : event.type,
    message: event.message,
  }
}

function dbEventToLog(row: TaskEventRow): LogEntry {
  return {
    id: row.id,
    timestamp: formatTime(row.created_at),
    agent: row.agent_type,
    type: row.event_type as LogEntry["type"],
    message: row.message,
  }
}

function extractSummary(events: LogEntry[]): string {
  const results = events.filter((e) => e.type === "result" && e.message)
  if (results.length > 0) {
    const last = results[results.length - 1]
    return last.message.length > 300 ? last.message.slice(0, 300) + "..." : last.message
  }
  const last = events[events.length - 1]
  return last ? (last.message.length > 200 ? last.message.slice(0, 200) + "..." : last.message) : "Processing..."
}

function pipelineSteps(status: ChatMessage["status"], events: LogEntry[]): StepperStep[] {
  const hasRouting = events.some((e) => e.agent === "system" && e.message.startsWith("Routing to agents"))
  const isTriaging = events.some((e) => e.agent === "system" && e.message.startsWith("Routing query to model"))
  const hasAgentWork = events.some((e) => e.agent !== "system" && e.agent !== "User")
  const hasSynth = events.some((e) => e.agent === "system" && e.message.startsWith("Synthesizing"))
  const hasResult = events.some((e) => e.type === "result" && e.agent === "system")

  if (status === "error") {
    return [
      { id: "triage", label: "Triage", status: hasRouting ? "completed" : "active" },
      { id: "agents", label: "Agents", status: hasAgentWork ? "completed" : "pending" },
      { id: "synthesize", label: "Error", status: "pending" },
    ]
  }
  if (status === "completed") {
    return [
      { id: "triage", label: "Triage", status: "completed" },
      { id: "agents", label: "Agents", status: "completed" },
      { id: "synthesize", label: "Done", status: "completed" },
    ]
  }
  return [
    { id: "triage", label: isTriaging && !hasRouting ? "Connecting..." : "Triage", status: hasRouting ? "completed" : "active" },
    { id: "agents", label: "Agents", status: hasAgentWork ? "active" : "pending" },
    { id: "synthesize", label: "Synthesize", status: hasSynth || hasResult ? "active" : "pending" },
  ]
}

// ── Storage key ───────────────────────────────────────────────────────────

const STORAGE_KEY = "magi-chat-messages"

function loadPersistedMessages(): ChatMessage[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function persistMessages(msgs: ChatMessage[]) {
  try {
    const toStore = msgs.slice(-100).map((m) => ({
      ...m,
      events: m.events.slice(-30),
    }))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore))
  } catch {
    // storage full, ignore
  }
}

// ── Sub-components ────────────────────────────────────────────────────────

function EventRow({ entry }: { entry: LogEntry }) {
  const Icon = typeIcons[entry.type] || Brain
  return (
    <div className="flex items-start gap-2 px-2 py-1">
      <Icon className={cn("mt-0.5 h-3 w-3 shrink-0", typeColors[entry.type])} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-muted-foreground">{entry.timestamp}</span>
          <Badge variant="outline" className={cn("font-mono text-[9px] px-1 py-0", getAgentColor(entry.agent))}>
            {entry.agent}
          </Badge>
        </div>
        <p className="mt-0.5 font-mono text-[11px] text-foreground/80 leading-relaxed">{entry.message}</p>
      </div>
    </div>
  )
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const [open, setOpen] = useState(false)

  if (message.type === "user") {
    return (
      <div className="flex items-start gap-2 py-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20">
          <User className="h-3 w-3 text-primary" />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="font-mono text-xs text-foreground">{message.query}</p>
          <span className="font-mono text-[10px] text-muted-foreground">{message.timestamp}</span>
        </div>
      </div>
    )
  }

  const steps = pipelineSteps(message.status, message.events)

  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <StatusStepper steps={steps} />
        {message.status === "streaming" && (
          <Badge
            variant="outline"
            className="animate-pulse border-success/30 bg-success/10 font-mono text-[10px] text-success"
          >
            STREAMING
          </Badge>
        )}
      </div>

      <div className="max-h-[12rem] overflow-y-auto">
        <p className="font-mono text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">
          {message.status === "streaming" && message.events.length === 0
            ? "Waiting for response..."
            : message.summary}
        </p>
      </div>

      {message.events.length > 0 && (
        <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
          <CollapsibleTrigger className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors">
            <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
            {message.events.length} event{message.events.length !== 1 ? "s" : ""} — chain of thought
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 max-h-[300px] overflow-y-auto rounded-md border border-border bg-card/60 py-1">
            {message.events.map((ev) => (
              <EventRow key={ev.id} entry={ev} />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>(loadPersistedMessages)
  const [inputValue, setInputValue] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const activeTaskIdRef = useRef<string | null>(null)
  const activeTaskMsgIdRef = useRef<string | null>(null)

  // Load teams on mount
  useEffect(() => {
    if (!supabaseConfigured) return
    fetchTeams()
      .then(setTeams)
      .catch(() => {})
  }, [])

  // Load history from Supabase on mount
  useEffect(() => {
    if (!supabaseConfigured) return
    const stored = loadPersistedMessages()
    if (stored.length > 0) return // already have local history

    fetchTasks(20)
      .then(async (tasks) => {
        const restored: ChatMessage[] = []
        for (const t of tasks.reverse()) {
          restored.push({
            id: `user-${t.id}`,
            type: "user",
            query: t.query,
            status: "completed",
            summary: "",
            events: [],
            timestamp: formatTime(t.created_at),
          })

          let events: LogEntry[] = []
          try {
            const rows = await fetchTaskEvents(t.id)
            events = rows.map(dbEventToLog)
          } catch {
            // skip
          }

          restored.push({
            id: `task-${t.id}`,
            type: "task",
            query: t.query,
            taskId: t.id,
            status: t.status === "completed" ? "completed" : t.status === "error" ? "error" : "completed",
            summary: t.merged_answer
              ? (t.merged_answer.length > 300 ? t.merged_answer.slice(0, 300) + "..." : t.merged_answer)
              : extractSummary(events),
            events,
            timestamp: formatTime(t.created_at),
          })
        }
        if (restored.length > 0) {
          setMessages(restored)
          persistMessages(restored)
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist on change
  useEffect(() => {
    persistMessages(messages)
  }, [messages])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim() || isSubmitting) return

    const query = inputValue.trim()
    const now = formatTime()

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      type: "user",
      query,
      status: "completed",
      summary: "",
      events: [],
      timestamp: now,
    }

    const taskMsg: ChatMessage = {
      id: `task-${Date.now()}`,
      type: "task",
      query,
      status: "streaming",
      summary: "Processing...",
      events: [],
      timestamp: now,
    }

    setMessages((prev) => [...prev, userMsg, taskMsg])
    setInputValue("")
    setIsSubmitting(true)

    abortRef.current?.abort()
    activeTaskIdRef.current = null
    activeTaskMsgIdRef.current = taskMsg.id
    abortRef.current = streamResearch(
      query,
      (event) => {
        if (event.task_id) activeTaskIdRef.current = event.task_id
        const log = swarmEventToLog(event)
        setMessages((prev) => {
          const updated = [...prev]
          const idx = updated.findIndex((m) => m.id === taskMsg.id)
          if (idx === -1) return prev
          const msg = { ...updated[idx] }
          msg.events = [...msg.events, log]
          msg.summary = extractSummary(msg.events)
          if (event.task_id) msg.taskId = event.task_id
          updated[idx] = msg
          return updated
        })
      },
      () => {
        activeTaskIdRef.current = null
        activeTaskMsgIdRef.current = null
        setMessages((prev) => {
          const updated = [...prev]
          const idx = updated.findIndex((m) => m.id === taskMsg.id)
          if (idx === -1) return prev
          updated[idx] = { ...updated[idx], status: "completed" }
          return updated
        })
        setIsSubmitting(false)
      },
      (err) => {
        activeTaskIdRef.current = null
        activeTaskMsgIdRef.current = null
        setMessages((prev) => {
          const updated = [...prev]
          const idx = updated.findIndex((m) => m.id === taskMsg.id)
          if (idx === -1) return prev
          updated[idx] = {
            ...updated[idx],
            status: "error",
            summary: `Error: ${err.message}`,
          }
          return updated
        })
        setIsSubmitting(false)
      },
      selectedTeamId ?? undefined,
    )
  }

  const handleCancel = async () => {
    abortRef.current?.abort()
    abortRef.current = null

    if (activeTaskIdRef.current) {
      cancelTask(activeTaskIdRef.current).catch(() => {})
    }

    if (activeTaskMsgIdRef.current) {
      setMessages((prev) => {
        const updated = [...prev]
        const idx = updated.findIndex((m) => m.id === activeTaskMsgIdRef.current)
        if (idx === -1) return prev
        updated[idx] = {
          ...updated[idx],
          status: "error",
          summary: updated[idx].summary.replace("Processing...", "") || "Cancelled by user",
        }
        return updated
      })
    }

    activeTaskIdRef.current = null
    activeTaskMsgIdRef.current = null
    setIsSubmitting(false)
  }

  return (
    <Card className="flex h-full flex-col border-border bg-card/80 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Brain className="h-3.5 w-3.5 text-primary" />
          Research Console
        </CardTitle>
        {teams.length > 0 && (
          <Select
            value={selectedTeamId ?? "all"}
            onValueChange={(v) => setSelectedTeamId(v === "all" ? null : v)}
          >
            <SelectTrigger className="h-8 w-[180px] font-mono text-[11px]" size="sm">
              <SelectValue placeholder="Team" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="font-mono text-xs">
                All agents (default)
              </SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id} className="font-mono text-xs">
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <ScrollArea className="min-h-0 flex-1 overflow-hidden p-3" ref={scrollRef}>
          <div className="space-y-3">
            {messages.length === 0 && (
              <p className="py-12 text-center font-mono text-xs text-muted-foreground">
                Send a research query to get started.
              </p>
            )}
            {messages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}
            <div ref={bottomRef} />
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
            placeholder="Send a research query to the swarm..."
            className="flex-1 rounded-md border border-border bg-secondary px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {isSubmitting ? (
            <button
              type="button"
              onClick={handleCancel}
              className="flex h-8 w-8 items-center justify-center rounded-md bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/80"
              title="Stop task"
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="submit"
              className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
