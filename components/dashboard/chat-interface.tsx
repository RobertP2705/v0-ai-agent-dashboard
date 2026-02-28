"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
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
  ChevronRight,
  Send,
  Square,
  Brain,
  AlertTriangle,
  CheckCircle2,
  Cog,
  Code2,
  Lightbulb,
  Loader2,
  Search,
  Terminal,
  User,
  Copy,
  Check,
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
  type TaskEventRow,
  type Team,
} from "@/lib/supabase"
import { createClient as createSupabaseClient } from "@/lib/supabase/client"
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

interface AgentMessageGroup {
  agent: string
  events: LogEntry[]
  lastTimestamp: string
  isDone: boolean
  hasError: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────

function formatTime(ts?: string | number): string {
  const d = ts ? new Date(typeof ts === "number" ? ts * 1000 : ts) : new Date()
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

function swarmEventToLog(event: SwarmEvent): LogEntry {
  return {
    id: `ev-${event.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: formatTime(event.timestamp),
    agent: event.agent,
    type: event.type === "done" ? "result" : event.type,
    message: event.message,
    meta: event.meta,
  }
}

function dbEventToLog(row: TaskEventRow): LogEntry {
  return {
    id: row.id,
    timestamp: formatTime(row.created_at),
    agent: row.agent_type,
    type: row.event_type as LogEntry["type"],
    message: row.message,
    meta: row.meta as Record<string, unknown> | undefined,
  }
}

function extractSummary(events: LogEntry[]): string {
  const results = events.filter((e) => e.type === "result" && e.message)
  if (results.length > 0) return results[results.length - 1].message
  const errors = events.filter((e) => e.type === "error")
  if (errors.length > 0) return ""
  const thoughts = events.filter((e) => e.type === "thought" || e.type === "action")
  if (thoughts.length > 0) return thoughts[thoughts.length - 1].message
  return "Processing..."
}

function pipelineSteps(status: ChatMessage["status"], events: LogEntry[]): StepperStep[] {
  const hasRouting = events.some((e) => e.agent === "system" && (e.message.startsWith("Routing to agents") || e.message.startsWith("Launching")))
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

function buildAgentGroups(events: LogEntry[]): AgentMessageGroup[] {
  const map: Record<string, LogEntry[]> = {}
  const order: string[] = []
  for (const e of events) {
    if (e.agent === "system" || e.agent === "User") continue
    if (!map[e.agent]) { map[e.agent] = []; order.push(e.agent) }
    map[e.agent].push(e)
  }
  return order.map((agent) => {
    const evts = map[agent]
    return {
      agent,
      events: evts,
      lastTimestamp: evts[evts.length - 1].timestamp,
      isDone: evts.some((e) => e.type === "result"),
      hasError: evts.some((e) => e.type === "error"),
    }
  })
}

function getToolIcon(tool?: string) {
  if (!tool) return Cog
  if (tool === "modal_sandbox") return Terminal
  if (tool.includes("search")) return Search
  if (tool === "fetch_url") return Code2
  return Cog
}

// ── Storage (user-specific) ─────────────────────────────────────────────────

function getStorageKey(userId: string | null) {
  return `magi-chat-messages-${userId ?? "anonymous"}`
}

function loadPersistedMessages(storageKey: string): ChatMessage[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(storageKey)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function persistMessages(msgs: ChatMessage[], storageKey: string) {
  try {
    const toStore = msgs.slice(-100).map((m) => ({
      ...m,
      events: m.events.slice(-50).map((e) => {
        if (e.meta?.code && typeof e.meta.code === "string" && e.meta.code.length > 500) {
          return { ...e, meta: { ...e.meta, code: (e.meta.code as string).slice(0, 500) + "\n# ... truncated for storage" } }
        }
        return e
      }),
    }))
    localStorage.setItem(storageKey, JSON.stringify(toStore))
  } catch { /* storage full */ }
}

// ── Markdown ──────────────────────────────────────────────────────────────

function Md({ children }: { children: string }) {
  return (
    <div className="prose prose-sm prose-invert max-w-none
      prose-headings:font-semibold prose-headings:text-foreground prose-headings:mt-3 prose-headings:mb-1.5
      prose-h1:text-base prose-h2:text-sm prose-h3:text-xs
      prose-p:text-xs prose-p:text-foreground/85 prose-p:leading-relaxed prose-p:my-1.5
      prose-ul:text-xs prose-ul:my-1 prose-ol:text-xs prose-ol:my-1
      prose-li:text-foreground/85 prose-li:my-0.5 prose-li:leading-relaxed
      prose-strong:text-foreground prose-strong:font-semibold
      prose-em:text-foreground/70
      prose-code:text-[11px] prose-code:bg-secondary prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-primary
      prose-pre:bg-secondary/80 prose-pre:rounded-md prose-pre:text-[11px] prose-pre:my-2
      prose-a:text-primary prose-a:underline prose-a:underline-offset-2
      prose-blockquote:border-l-primary/40 prose-blockquote:text-foreground/60 prose-blockquote:text-xs
      prose-hr:border-border prose-hr:my-2
      prose-table:text-xs prose-th:text-foreground prose-td:text-foreground/80
    ">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}

// ── Code viewer ───────────────────────────────────────────────────────────

function CodeViewer({ code, language, stdout, stderr, exitCode }: {
  code: string
  language?: string
  stdout?: string
  stderr?: string
  exitCode?: number | null
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-1 rounded-md border border-border bg-card/80 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-2 py-1">
        <div className="flex items-center gap-2">
          <Terminal className="h-3 w-3 text-chart-2" />
          <span className="font-mono text-[10px] text-muted-foreground">{language || "python"}</span>
          {exitCode != null && (
            <Badge variant="outline" className={cn("font-mono text-[9px] px-1 py-0",
              exitCode === 0 ? "text-success border-success/30" : "text-destructive border-destructive/30"
            )}>
              exit {exitCode}
            </Badge>
          )}
        </div>
        <button onClick={handleCopy} className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
          {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
          <span className="font-mono text-[9px]">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="max-h-[300px] overflow-auto p-2 font-mono text-[11px] text-foreground/80 leading-relaxed">
        <code>{code}</code>
      </pre>
      {(stdout || stderr) && (
        <div className="border-t border-border">
          {stdout && (
            <pre className="max-h-[150px] overflow-auto p-2 font-mono text-[10px] text-foreground/60 leading-relaxed bg-secondary/30">
              <code>{stdout}</code>
            </pre>
          )}
          {stderr && (
            <pre className="max-h-[100px] overflow-auto p-2 font-mono text-[10px] text-destructive/80 leading-relaxed bg-destructive/5">
              <code>{stderr}</code>
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tool call card ────────────────────────────────────────────────────────

function ToolCallCard({ event, resultEvent }: { event: LogEntry; resultEvent?: LogEntry }) {
  const [expanded, setExpanded] = useState(false)
  const tool = (event.meta?.tool as string) || ""
  const Icon = getToolIcon(tool)
  const isSandbox = tool === "modal_sandbox"
  const code = event.meta?.code as string | undefined
  const exitCode = resultEvent?.meta?.exit_code as number | undefined
  const stdout = resultEvent?.meta?.stdout as string | undefined
  const stderr = resultEvent?.meta?.stderr as string | undefined

  return (
    <div className="my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left font-mono text-[11px] transition-all hover:bg-secondary/50",
          exitCode === 0 ? "border-success/20 bg-success/5"
            : exitCode != null ? "border-destructive/20 bg-destructive/5"
            : "border-border bg-card/40"
        )}
      >
        <Icon className="h-3 w-3 shrink-0 text-chart-2" />
        <span className="flex-1 truncate text-foreground/80">{event.message}</span>
        {exitCode != null && (
          <Badge variant="outline" className={cn("text-[9px] px-1 py-0 shrink-0",
            exitCode === 0 ? "text-success border-success/30" : "text-destructive border-destructive/30"
          )}>
            {exitCode === 0 ? "OK" : `exit ${exitCode}`}
          </Badge>
        )}
        <ChevronRight className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
      </button>
      {expanded && (
        <div className="pl-2">
          {isSandbox && code ? (
            <CodeViewer code={code} stdout={stdout} stderr={stderr} exitCode={exitCode ?? null} />
          ) : (
            <div className="mt-1 rounded-md border border-border bg-card/60 p-2">
              <pre className="max-h-[200px] overflow-auto font-mono text-[10px] text-foreground/70 whitespace-pre-wrap">
                {JSON.stringify(event.meta?.args || event.meta, null, 2)}
              </pre>
              {resultEvent && (
                <p className="mt-1 font-mono text-[10px] text-muted-foreground border-t border-border pt-1">
                  {resultEvent.message}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Agent chat bubble ─────────────────────────────────────────────────────

function AgentBubble({ group, isActive }: { group: AgentMessageGroup; isActive: boolean }) {
  const [showVerbose, setShowVerbose] = useState(false)

  const lastResult = [...group.events].reverse().find((e) => e.type === "result" && !e.meta?.tool)
  const latestAction = [...group.events].reverse().find((e) => e.type === "action" || e.type === "thought")

  const toolPairs: { action: LogEntry; result?: LogEntry }[] = useMemo(() => {
    const pairs: { action: LogEntry; result?: LogEntry }[] = []
    for (let i = 0; i < group.events.length; i++) {
      const e = group.events[i]
      if (e.type === "action" && e.meta?.tool) {
        const nextResult = group.events.slice(i + 1).find((r) => r.type === "result" && r.meta?.tool === e.meta?.tool)
        pairs.push({ action: e, result: nextResult })
      }
    }
    return pairs
  }, [group.events])

  const statusLine = group.hasError
    ? "Error encountered"
    : group.isDone
      ? `Completed — ${group.events.length} steps`
      : isActive
        ? (latestAction?.message || "Working...")
        : "Idle"

  return (
    <div className="flex gap-2 py-1">
      <div className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full mt-0.5",
        group.hasError ? "bg-destructive/20" : group.isDone ? "bg-success/20" : "bg-primary/20",
      )}>
        {isActive && !group.isDone && !group.hasError ? (
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
        ) : group.isDone ? (
          <CheckCircle2 className="h-3 w-3 text-success" />
        ) : group.hasError ? (
          <AlertTriangle className="h-3 w-3 text-destructive" />
        ) : (
          <Brain className="h-3 w-3 text-primary" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn("font-mono text-[10px] px-1.5 py-0", getAgentColor(group.agent))}>
            {group.agent}
          </Badge>
          <span className="font-mono text-[10px] text-muted-foreground">{group.lastTimestamp}</span>
        </div>

        <p className="mt-0.5 font-mono text-[11px] text-foreground/70 truncate">
          {statusLine}
        </p>

        {toolPairs.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {toolPairs.map((pair, i) => (
              <ToolCallCard key={i} event={pair.action} resultEvent={pair.result} />
            ))}
          </div>
        )}

        {lastResult && group.isDone && (
          <Collapsible className="mt-1.5">
            <CollapsibleTrigger className="flex items-center gap-1 font-mono text-[10px] text-primary hover:text-primary/80 transition-colors">
              <ChevronDown className="h-3 w-3" />
              View response
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1 rounded-md border border-border bg-card/60 p-2 max-h-[300px] overflow-y-auto">
              <Md>{lastResult.message}</Md>
            </CollapsibleContent>
          </Collapsible>
        )}

        {group.events.length > 1 && (
          <Collapsible open={showVerbose} onOpenChange={setShowVerbose} className="mt-1">
            <CollapsibleTrigger className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors">
              <ChevronDown className={cn("h-3 w-3 transition-transform", showVerbose && "rotate-180")} />
              {group.events.length} events — verbose log
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1 max-h-[200px] overflow-y-auto rounded-md border border-border bg-card/60 py-1">
              {group.events.map((ev) => {
                const Icon = ev.type === "thought" ? Lightbulb : ev.type === "action" ? Cog : ev.type === "result" ? CheckCircle2 : AlertTriangle
                const color = ev.type === "thought" ? "text-chart-3" : ev.type === "action" ? "text-chart-2" : ev.type === "result" ? "text-success" : "text-destructive"
                return (
                  <div key={ev.id} className="flex items-start gap-1.5 px-2 py-0.5">
                    <Icon className={cn("mt-0.5 h-2.5 w-2.5 shrink-0", color)} />
                    <span className="font-mono text-[10px] text-muted-foreground shrink-0">{ev.timestamp}</span>
                    <p className="font-mono text-[10px] text-foreground/70 truncate">{ev.message}</p>
                  </div>
                )
              })}
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  )
}

// ── Task bubble ───────────────────────────────────────────────────────────

function ChatBubble({ message }: { message: ChatMessage }) {
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
  const groups = useMemo(() => buildAgentGroups(message.events), [message.events])
  const systemEvents = message.events.filter((e) => e.agent === "system")
  const isStreaming = message.status === "streaming"
  const hasFinalResult = message.status === "completed" && message.summary

  return (
    <div className="rounded-lg border border-border bg-secondary/10 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <StatusStepper steps={steps} />
        {isStreaming && (
          <Badge variant="outline" className="animate-pulse border-success/30 bg-success/10 font-mono text-[10px] text-success">
            LIVE
          </Badge>
        )}
      </div>

      {groups.length > 0 && (
        <div className="space-y-1 border-l-2 border-border pl-2">
          {groups.map((group) => (
            <AgentBubble key={group.agent} group={group} isActive={isStreaming} />
          ))}
        </div>
      )}

      {isStreaming && groups.length === 0 && (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          <span className="font-mono text-xs text-muted-foreground">
            {systemEvents.length > 0 ? systemEvents[systemEvents.length - 1].message : "Connecting to swarm..."}
          </span>
        </div>
      )}

      {hasFinalResult && (
        <div className="rounded-md border border-border bg-card/60 p-3 max-h-[28rem] overflow-y-auto">
          <div className="flex items-center gap-1.5 mb-2">
            <Brain className="h-3 w-3 text-primary" />
            <span className="font-mono text-[10px] font-medium text-primary">Synthesized Report</span>
          </div>
          <Md>{message.summary}</Md>
        </div>
      )}

      {message.status === "error" && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2">
          <p className="font-mono text-xs text-destructive">{message.summary}</p>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export function ChatInterface() {
  const [userId, setUserId] = useState<string | null | undefined>(undefined)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const activeTaskIdRef = useRef<string | null>(null)
  const activeTaskMsgIdRef = useRef<string | null>(null)
  const loadedForUserRef = useRef<string | null | undefined>(undefined)
  const savedToMemoryRef = useRef<Set<string>>(new Set())

  const storageKey = getStorageKey(userId ?? null)

  useEffect(() => {
    if (!supabaseConfigured) { setUserId(null); return }
    createSupabaseClient().auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null)
    })
  }, [])

  useEffect(() => {
    if (!supabaseConfigured) return
    fetchTeams().then(setTeams).catch(() => {})
  }, [])

  useEffect(() => {
    if (userId === undefined) return
    if (loadedForUserRef.current === userId) return
    loadedForUserRef.current = userId

    const key = getStorageKey(userId)
    const stored = loadPersistedMessages(key)
    if (stored.length > 0) {
      setMessages(stored)
      return
    }

    if (!supabaseConfigured) return

    fetchTasks(20)
      .then(async (tasks) => {
        const restored: ChatMessage[] = []
        for (const t of tasks.reverse()) {
          restored.push({ id: `user-${t.id}`, type: "user", query: t.query, status: "completed", summary: "", events: [], timestamp: formatTime(t.created_at) })
          let events: LogEntry[] = []
          try { events = (await fetchTaskEvents(t.id)).map(dbEventToLog) } catch { /* skip */ }
          restored.push({
            id: `task-${t.id}`, type: "task", query: t.query, taskId: t.id,
            status: t.status === "completed" ? "completed" : t.status === "error" ? "error" : "completed",
            summary: t.merged_answer || extractSummary(events), events, timestamp: formatTime(t.created_at),
          })
        }
        if (restored.length > 0) { setMessages(restored); persistMessages(restored, key) }
      })
      .catch(() => {})
  }, [userId])

  useEffect(() => {
    if (userId === undefined) return
    persistMessages(messages, storageKey)
  }, [messages, storageKey, userId])

  // Save completed research tasks to Supermemory (per-user memory)
  useEffect(() => {
    if (userId === undefined || !userId) return
    for (const m of messages) {
      if (m.type !== "task" || m.status !== "completed" || savedToMemoryRef.current.has(m.id)) continue
      const summary = m.summary?.trim() || ""
      if (!summary && !m.query?.trim()) continue
      savedToMemoryRef.current.add(m.id)
      const content = [m.query, summary].filter(Boolean).join("\n\n")
      fetch("/api/memory/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          metadata: { taskId: m.taskId, query: m.query },
          title: m.query?.slice(0, 100) || "Research",
        }),
      }).catch(() => {})
    }
  }, [messages, userId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim() || isSubmitting) return
    const query = inputValue.trim()
    const now = formatTime()
    const userMsg: ChatMessage = { id: `user-${Date.now()}`, type: "user", query, status: "completed", summary: "", events: [], timestamp: now }
    const taskMsg: ChatMessage = { id: `task-${Date.now()}`, type: "task", query, status: "streaming", summary: "", events: [], timestamp: now }
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
        activeTaskIdRef.current = null; activeTaskMsgIdRef.current = null
        setMessages((prev) => {
          const updated = [...prev]; const idx = updated.findIndex((m) => m.id === taskMsg.id)
          if (idx === -1) return prev
          const msg = updated[idx]
          const hasResult = msg.events.some((e) => e.type === "result")
          const hasError = msg.events.some((e) => e.type === "error")
          const finalStatus = hasResult ? "completed" : hasError ? "error" : "completed"
          const summary = finalStatus === "error" && !hasResult
            ? msg.events.filter((e) => e.type === "error").map((e) => e.message).join("; ")
            : msg.summary
          updated[idx] = { ...updated[idx], status: finalStatus, summary }
          return updated
        })
        setIsSubmitting(false)
      },
      (err) => {
        activeTaskIdRef.current = null; activeTaskMsgIdRef.current = null
        setMessages((prev) => {
          const updated = [...prev]; const idx = updated.findIndex((m) => m.id === taskMsg.id)
          if (idx === -1) return prev
          updated[idx] = { ...updated[idx], status: "error", summary: `Error: ${err.message}` }; return updated
        })
        setIsSubmitting(false)
      },
      selectedTeamId ?? undefined,
    )
  }

  const handleCancel = async () => {
    abortRef.current?.abort(); abortRef.current = null
    if (activeTaskIdRef.current) cancelTask(activeTaskIdRef.current).catch(() => {})
    if (activeTaskMsgIdRef.current) {
      setMessages((prev) => {
        const updated = [...prev]; const idx = updated.findIndex((m) => m.id === activeTaskMsgIdRef.current)
        if (idx === -1) return prev
        updated[idx] = { ...updated[idx], status: "error", summary: "Cancelled by user" }; return updated
      })
    }
    activeTaskIdRef.current = null; activeTaskMsgIdRef.current = null; setIsSubmitting(false)
  }

  return (
    <Card className="flex h-full flex-col border-border bg-card/80 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Brain className="h-3.5 w-3.5 text-primary" />
          Research Console
        </CardTitle>
        {teams.length > 0 && (
          <Select value={selectedTeamId ?? "all"} onValueChange={(v) => setSelectedTeamId(v === "all" ? null : v)}>
            <SelectTrigger className="h-8 w-[180px] font-mono text-[11px]" size="sm"><SelectValue placeholder="Team" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="font-mono text-xs">All agents (default)</SelectItem>
              {teams.map((t) => (<SelectItem key={t.id} value={t.id} className="font-mono text-xs">{t.name}</SelectItem>))}
            </SelectContent>
          </Select>
        )}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <ScrollArea className="min-h-0 flex-1 overflow-hidden p-3" ref={scrollRef}>
          <div className="space-y-3">
            {messages.length === 0 && (
              <p className="py-12 text-center font-mono text-xs text-muted-foreground">Send a research query to get started.</p>
            )}
            {messages.map((msg) => (<ChatBubble key={msg.id} message={msg} />))}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
        <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-border p-3">
          <input
            type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)}
            placeholder="Send a research query to the swarm..."
            className="flex-1 rounded-md border border-border bg-secondary px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {isSubmitting ? (
            <button type="button" onClick={handleCancel} className="flex h-8 w-8 items-center justify-center rounded-md bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/80" title="Stop task">
              <Square className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button type="submit" className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-50">
              <Send className="h-3.5 w-3.5" />
            </button>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
