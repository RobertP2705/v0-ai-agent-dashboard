"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"
import { ResizableCard } from "@/components/ui/resizable-card"
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
  Trash2,
  BookOpen,
  Compass,
} from "lucide-react"
import { SupermemoryIcon } from "@/components/ui/supermemory-icon"
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
import { useStreaming } from "@/lib/streaming-context"
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
  memorySaved?: boolean
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

const ANONYMOUS_ID_KEY = "magi-chat-anonymous-id"

/** Per-browser anonymous id so unauthenticated users don't all share the same chat history. */
function getAnonymousStorageId(): string {
  if (typeof window === "undefined") return "anonymous"
  try {
    let id = localStorage.getItem(ANONYMOUS_ID_KEY)
    if (!id) {
      id =
        (typeof crypto !== "undefined" && crypto.randomUUID?.()) ||
        `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`
      localStorage.setItem(ANONYMOUS_ID_KEY, id)
    }
    return id
  } catch {
    return "anonymous"
  }
}

function getStorageKey(userId: string | null): string {
  if (userId) return `magi-chat-messages-${userId}`
  return `magi-chat-messages-anonymous-${getAnonymousStorageId()}`
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

// ── Markdown code block with copy + syntax highlighting ──────────────────

function MarkdownCodeBlock({ language, children }: { language?: string; children: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="my-2 rounded-md border border-border overflow-hidden">
      <div className="flex items-center justify-between bg-secondary/80 px-3 py-1">
        <span className="font-mono text-[10px] text-muted-foreground">{language || "code"}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
          <span className="font-mono text-[9px]">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <SyntaxHighlighter
        language={language || "text"}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: "0.75rem",
          fontSize: "11px",
          lineHeight: "1.6",
          background: "oklch(0.16 0.007 260 / 0.8)",
          borderRadius: 0,
        }}
        wrapLongLines
      >
        {children}
      </SyntaxHighlighter>
    </div>
  )
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
      prose-pre:bg-transparent prose-pre:p-0 prose-pre:my-0
      prose-a:text-primary prose-a:underline prose-a:underline-offset-2
      prose-blockquote:border-l-primary/40 prose-blockquote:text-foreground/60 prose-blockquote:text-xs
      prose-hr:border-border prose-hr:my-2
      prose-table:text-xs prose-th:text-foreground prose-td:text-foreground/80
    ">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            return <>{children}</>
          },
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "")
            const codeStr = String(children).replace(/\n$/, "")
            if (match) {
              return <MarkdownCodeBlock language={match[1]}>{codeStr}</MarkdownCodeBlock>
            }
            if (codeStr.includes("\n")) {
              return <MarkdownCodeBlock>{codeStr}</MarkdownCodeBlock>
            }
            return <code className={className} {...props}>{children}</code>
          },
        }}
      >
        {children}
      </ReactMarkdown>
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
    <ResizableCard className="mt-1 rounded-md border border-border bg-card/80 overflow-hidden" defaultHeight={260} minHeight={80} maxHeight={800}>
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
      <SyntaxHighlighter
        language={language || "python"}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: "0.5rem",
          fontSize: "11px",
          lineHeight: "1.6",
          background: "transparent",
          borderRadius: 0,
        }}
        wrapLongLines
      >
        {code}
      </SyntaxHighlighter>
      {(stdout || stderr) && (
        <div className="border-t border-border">
          {stdout && (
            <pre className="overflow-auto p-2 font-mono text-[10px] text-foreground/60 leading-relaxed bg-secondary/30">
              <code>{stdout}</code>
            </pre>
          )}
          {stderr && (
            <pre className="overflow-auto p-2 font-mono text-[10px] text-destructive/80 leading-relaxed bg-destructive/5">
              <code>{stderr}</code>
            </pre>
          )}
        </div>
      )}
    </ResizableCard>
  )
}

// ── Tool call card ────────────────────────────────────────────────────────

function SandboxCard({ event, resultEvent }: { event: LogEntry; resultEvent?: LogEntry }) {
  const [codeOpen, setCodeOpen] = useState(true)
  const [stdoutOpen, setStdoutOpen] = useState(true)
  const [copied, setCopied] = useState(false)
  const code = event.meta?.code as string | undefined
  const exitCode = resultEvent?.meta?.exit_code as number | undefined
  const stdout = resultEvent?.meta?.stdout as string | undefined
  const stderr = resultEvent?.meta?.stderr as string | undefined

  const handleCopy = () => {
    if (!code) return
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={cn("my-1 rounded-md border overflow-hidden",
      exitCode === 0 ? "border-success/20" : exitCode != null ? "border-destructive/20" : "border-border"
    )}>
      <div className={cn("flex items-center gap-2 px-2 py-1.5 font-mono text-[11px]",
        exitCode === 0 ? "bg-success/5" : exitCode != null ? "bg-destructive/5" : "bg-card/40"
      )}>
        <Terminal className="h-3 w-3 shrink-0 text-chart-2" />
        <span className="flex-1 truncate text-foreground/80">{event.message}</span>
        {exitCode != null && (
          <Badge variant="outline" className={cn("text-[9px] px-1 py-0 shrink-0",
            exitCode === 0 ? "text-success border-success/30" : "text-destructive border-destructive/30"
          )}>
            {exitCode === 0 ? "OK" : `exit ${exitCode}`}
          </Badge>
        )}
      </div>

      {code && (
        <Collapsible open={codeOpen} onOpenChange={setCodeOpen}>
          <CollapsibleTrigger className="w-full flex items-center gap-1.5 px-2 py-1 border-t border-border bg-secondary/30 hover:bg-secondary/50 transition-colors">
            <Code2 className="h-2.5 w-2.5 text-chart-2" />
            <span className="font-mono text-[9px] text-muted-foreground flex-1 text-left">Code</span>
            <button
              onClick={(e) => { e.stopPropagation(); handleCopy() }}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              {copied ? <Check className="h-2.5 w-2.5 text-success" /> : <Copy className="h-2.5 w-2.5" />}
              <span className="font-mono text-[9px]">{copied ? "Copied" : "Copy"}</span>
            </button>
            <ChevronDown className={cn("h-2.5 w-2.5 text-muted-foreground transition-transform", !codeOpen && "-rotate-90")} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="max-h-[300px] overflow-auto bg-card/60">
              <SyntaxHighlighter
                language="python"
                style={oneDark}
                customStyle={{
                  margin: 0,
                  padding: "0.5rem",
                  fontSize: "11px",
                  lineHeight: "1.6",
                  background: "transparent",
                  borderRadius: 0,
                }}
                wrapLongLines
              >
                {code}
              </SyntaxHighlighter>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {stdout && (
        <Collapsible open={stdoutOpen} onOpenChange={setStdoutOpen}>
          <CollapsibleTrigger className="w-full flex items-center gap-1.5 px-2 py-1 border-t border-border bg-secondary/20 hover:bg-secondary/40 transition-colors">
            <Terminal className="h-2.5 w-2.5 text-success" />
            <span className="font-mono text-[9px] text-success/80 flex-1 text-left">stdout</span>
            <ChevronDown className={cn("h-2.5 w-2.5 text-muted-foreground transition-transform", !stdoutOpen && "-rotate-90")} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="max-h-[200px] overflow-auto p-2 font-mono text-[10px] text-foreground/70 leading-relaxed bg-secondary/10">
              <code>{stdout}</code>
            </pre>
          </CollapsibleContent>
        </Collapsible>
      )}

      {stderr && (
        <div className="border-t border-destructive/20">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-destructive/10">
            <AlertTriangle className="h-2.5 w-2.5 text-destructive" />
            <span className="font-mono text-[9px] text-destructive/80">stderr</span>
          </div>
          <pre className="max-h-[150px] overflow-auto p-2 font-mono text-[10px] text-destructive/80 leading-relaxed bg-destructive/5">
            <code>{stderr}</code>
          </pre>
        </div>
      )}
    </div>
  )
}

function ToolCallCard({ event, resultEvent, autoExpand = false }: { event: LogEntry; resultEvent?: LogEntry; autoExpand?: boolean }) {
  const [expanded, setExpanded] = useState(autoExpand)
  const tool = (event.meta?.tool as string) || ""
  const Icon = getToolIcon(tool)
  const isSandbox = tool === "modal_sandbox"

  if (isSandbox) {
    return <SandboxCard event={event} resultEvent={resultEvent} />
  }

  return (
    <div className="my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 rounded-md border border-border bg-card/40 px-2 py-1.5 text-left font-mono text-[11px] transition-all hover:bg-secondary/50"
      >
        <Icon className="h-3 w-3 shrink-0 text-chart-2" />
        <span className="flex-1 truncate text-foreground/80">{event.message}</span>
        <ChevronRight className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
      </button>
      {expanded && (
        <div className="pl-2">
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
        </div>
      )}
    </div>
  )
}

// ── Agent chat bubble ─────────────────────────────────────────────────────

function AgentBubble({ group, isActive }: { group: AgentMessageGroup; isActive: boolean }) {
  const [showVerbose, setShowVerbose] = useState(false)

  const latestAction = [...group.events].reverse().find((e) => e.type === "action" || e.type === "thought")

  const displayItems = useMemo(() => {
    const items: Array<
      | { kind: "thought"; event: LogEntry }
      | { kind: "tool"; action: LogEntry; result?: LogEntry }
      | { kind: "final-result"; event: LogEntry }
    > = []
    const pairedResultIds = new Set<string>()
    for (let i = 0; i < group.events.length; i++) {
      const e = group.events[i]
      if (e.type === "action" && e.meta?.tool) {
        const result = group.events.slice(i + 1).find((r) => r.type === "result" && r.meta?.tool === e.meta?.tool)
        if (result) pairedResultIds.add(result.id)
      }
    }
    for (const e of group.events) {
      if (pairedResultIds.has(e.id)) continue
      if (e.type === "thought") {
        items.push({ kind: "thought", event: e })
      } else if (e.type === "action" && e.meta?.tool) {
        const idx = group.events.indexOf(e)
        const result = group.events.slice(idx + 1).find((r) => r.type === "result" && r.meta?.tool === e.meta?.tool)
        items.push({ kind: "tool", action: e, result })
      } else if (e.type === "result" && !e.meta?.tool) {
        items.push({ kind: "final-result", event: e })
      }
    }
    return items
  }, [group.events])

  const lastFinalResult = [...displayItems].reverse().find((i) => i.kind === "final-result")

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

        {displayItems.length > 0 && (
          <div className="mt-1.5 space-y-1">
            {displayItems.map((item, i) => {
              if (item.kind === "thought") {
                return (
                  <div key={item.event.id} className="flex items-start gap-2 rounded-md bg-chart-3/5 border border-chart-3/10 px-2 py-1.5">
                    <Lightbulb className="h-3 w-3 mt-0.5 shrink-0 text-chart-3/70" />
                    <p className="font-mono text-[11px] text-foreground/60 italic leading-relaxed">
                      &ldquo;{item.event.message}&rdquo;
                    </p>
                  </div>
                )
              }
              if (item.kind === "tool") {
                return <ToolCallCard key={item.action.id} event={item.action} resultEvent={item.result} autoExpand={isActive} />
              }
              if (item.kind === "final-result" && item === lastFinalResult && group.isDone) {
                return (
                  <Collapsible key={item.event.id} defaultOpen={isActive} className="mt-1.5">
                    <CollapsibleTrigger className="flex items-center gap-1 font-mono text-[10px] text-primary hover:text-primary/80 transition-colors">
                      <ChevronDown className="h-3 w-3" />
                      View response
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-1">
                      <ResizableCard className="rounded-md border border-border bg-card/60" defaultHeight={240} minHeight={80} maxHeight={800}>
                        <div className="p-2">
                          <Md>{item.event.message}</Md>
                        </div>
                      </ResizableCard>
                    </CollapsibleContent>
                  </Collapsible>
                )
              }
              return null
            })}
          </div>
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
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 overflow-x-auto">
          <StatusStepper steps={steps} />
        </div>
        <div className="flex items-center gap-1.5">
          {message.memorySaved && (
            <Badge variant="outline" className="font-mono text-[9px] px-1.5 py-0 border-primary/40 bg-primary/10 text-primary" title="Saved to Supermemory">
              <SupermemoryIcon className="h-2.5 w-2.5 mr-0.5" />
              Saved to Supermemory
            </Badge>
          )}
          {isStreaming && (
            <Badge variant="outline" className="animate-pulse border-success/30 bg-success/10 font-mono text-[10px] text-success">
              LIVE
            </Badge>
          )}
        </div>
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
        <ResizableCard className="rounded-md border border-border bg-card/60" defaultHeight={320} minHeight={100} maxHeight={900}>
          <div className="p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Brain className="h-3 w-3 text-primary" />
              <span className="font-mono text-[10px] font-medium text-primary">Synthesized Report</span>
            </div>
            <Md>{message.summary}</Md>
          </div>
        </ResizableCard>
      )}

      {message.status === "error" && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2">
          <p className="font-mono text-xs text-destructive">{message.summary}</p>
        </div>
      )}
    </div>
  )
}

// ── Event stream panel (fullscreen right sidebar) ────────────────────────

function EventStreamPanel({ events }: { events: LogEntry[] }) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }) }, [events.length])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Terminal className="h-3.5 w-3.5 text-primary" />
        <span className="font-mono text-xs font-medium text-foreground">Event Stream</span>
        <Badge variant="outline" className="ml-auto font-mono text-[9px] px-1.5 py-0">
          {events.length}
        </Badge>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2 space-y-px">
          {events.length === 0 && (
            <p className="py-8 text-center font-mono text-[10px] text-muted-foreground">
              Events will appear here during research...
            </p>
          )}
          {events.map((ev) => {
            const color =
              ev.type === "thought" ? "text-chart-3"
                : ev.type === "action" ? "text-chart-2"
                : ev.type === "result" ? "text-success"
                : ev.type === "error" ? "text-destructive"
                : "text-muted-foreground"
            return (
              <div key={ev.id} className="flex items-start gap-1.5 rounded px-1.5 py-0.5 font-mono text-[10px] hover:bg-secondary/40 transition-colors">
                <span className="shrink-0 text-muted-foreground/60 tabular-nums">{ev.timestamp}</span>
                <span className={cn("shrink-0 font-medium", color)}>[{ev.agent}]</span>
                <span className="text-foreground/60 break-all leading-relaxed">{ev.message.slice(0, 200)}</span>
              </div>
            )
          })}
          <div ref={endRef} />
        </div>
      </ScrollArea>
    </div>
  )
}

// ── Live stats pill ──────────────────────────────────────────────────────

function LiveStats({ eventCount, agentCount, startTime }: { eventCount: number; agentCount: number; startTime: number }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setElapsed((Date.now() - startTime) / 1000), 100)
    return () => clearInterval(interval)
  }, [startTime])

  return (
    <div className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 font-mono text-[11px] text-primary">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
      </span>
      <span>{eventCount} events</span>
      <span className="text-primary/40">·</span>
      <span>{agentCount} agent{agentCount !== 1 ? "s" : ""}</span>
      <span className="text-primary/40">·</span>
      <span className="tabular-nums">{elapsed.toFixed(1)}s</span>
    </div>
  )
}

// ── Compact agent status indicator for fullscreen research tab ────────────

const agentDefs: { id: string; label: string; icon: React.ElementType }[] = [
  { id: "paper-collector", label: "Paper Collector", icon: BookOpen },
  { id: "implementer", label: "Implementer", icon: Terminal },
  { id: "research-director", label: "Research Director", icon: Compass },
]

function AgentStatusBar() {
  const { isStreaming, activeAgents } = useStreaming()
  return (
    <div className="flex items-center gap-1.5">
      {agentDefs.map(({ id, label, icon: Icon }) => {
        const busy = isStreaming && activeAgents.includes(id)
        return (
          <div
            key={id}
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] transition-colors",
              busy
                ? "bg-success/15 text-success border border-success/30"
                : "bg-secondary/50 text-muted-foreground border border-transparent"
            )}
            title={`${label}: ${busy ? "busy" : "idle"}`}
          >
            {busy ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <Icon className="h-2.5 w-2.5" />
            )}
            <span className="hidden sm:inline">{label.split(" ")[0]}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────

let nextMsgId = 0

export function ChatInterface({ fullscreen = false }: { fullscreen?: boolean }) {
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
  const [memoryEnabled, setMemoryEnabled] = useState(false)
  const [streamStartTime, setStreamStartTime] = useState<number | null>(null)
  const { setStreamingState } = useStreaming()
  const activeAgentsRef = useRef<Set<string>>(new Set())

  const storageKey = getStorageKey(userId ?? null)

  useEffect(() => {
    fetch("/api/memory/status")
      .then((r) => r.ok && r.json())
      .then((data) => data?.enabled && setMemoryEnabled(true))
      .catch(() => {})
  }, [])

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
      for (const m of stored) {
        if (m.memorySaved) savedToMemoryRef.current.add(m.id)
      }
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

  // Save user messages and completed research tasks to Supermemory
  useEffect(() => {
    if (userId === undefined || !userId) return
    for (const m of messages) {
      if (savedToMemoryRef.current.has(m.id)) continue

      if (m.type === "user") {
        const query = m.query?.trim()
        if (!query) continue
        savedToMemoryRef.current.add(m.id)
        fetch("/api/memory/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `User query: ${query}`,
            metadata: { type: "user_message" },
            title: query.slice(0, 100),
          }),
        }).catch(() => {})
        continue
      }

      if (m.type !== "task" || m.status !== "completed") continue
      const summary = m.summary?.trim() || ""
      if (!summary && !m.query?.trim()) continue
      savedToMemoryRef.current.add(m.id)
      const content = [m.query, summary].filter(Boolean).join("\n\n")
      const messageId = m.id
      fetch("/api/memory/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          metadata: { taskId: m.taskId, query: m.query },
          title: m.query?.slice(0, 100) || "Research",
        }),
      })
        .then((res) => {
          if (res.ok) {
            setMessages((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, memorySaved: true } : msg)))
          }
        })
        .catch(() => {})
    }
  }, [messages, userId])

  const userScrolledUpRef = useRef(false)

  useEffect(() => {
    if (!userScrolledUpRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])

  const handleScroll = useCallback(() => {
    const viewport = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null
    if (!viewport) return
    const distFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
    userScrolledUpRef.current = distFromBottom > 150
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim() || isSubmitting) return
    const query = inputValue.trim()
    const now = formatTime()
    const seq = ++nextMsgId
    const userMsg: ChatMessage = { id: `user-${Date.now()}-${seq}`, type: "user", query, status: "completed", summary: "", events: [], timestamp: now }
    const taskMsg: ChatMessage = { id: `task-${Date.now()}-${seq}`, type: "task", query, status: "streaming", summary: "", events: [], timestamp: now }
    setMessages((prev) => [...prev, userMsg, taskMsg])
    setInputValue("")
    setIsSubmitting(true)
    setStreamStartTime(Date.now())
    abortRef.current?.abort()
    activeTaskIdRef.current = null
    activeTaskMsgIdRef.current = taskMsg.id
    activeAgentsRef.current = new Set()
    setStreamingState({ isStreaming: true, activeAgents: [] })
    abortRef.current = streamResearch(
      query,
      (event) => {
        if (event.task_id) activeTaskIdRef.current = event.task_id
        const log = swarmEventToLog(event)
        // Update streaming context outside of setState to avoid side-effects in updater
        if (event.agent && event.agent !== "system" && event.agent !== "User") {
          const id = event.agent.replace(/ #\d+$/, "").toLowerCase().replace(/\s+/g, "-")
          if (!activeAgentsRef.current.has(id)) {
            activeAgentsRef.current.add(id)
            setStreamingState({ isStreaming: true, activeAgents: [...activeAgentsRef.current] })
          }
        }
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
        setStreamStartTime(null)
        setStreamingState({ isStreaming: false, activeAgents: [] })
        activeAgentsRef.current = new Set()
        setMessages((prev) => {
          const updated = [...prev]
          const idx = updated.findIndex((m) => m.id === taskMsg.id)
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
        activeTaskIdRef.current = null
        activeTaskMsgIdRef.current = null
        setStreamStartTime(null)
        setStreamingState({ isStreaming: false, activeAgents: [] })
        activeAgentsRef.current = new Set()
        setMessages((prev) => {
          const updated = [...prev]
          const idx = updated.findIndex((m) => m.id === taskMsg.id)
          if (idx === -1) return prev
          updated[idx] = { ...updated[idx], status: "error", summary: `Error: ${err.message}` }
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
    if (activeTaskIdRef.current) cancelTask(activeTaskIdRef.current).catch(() => {})
    if (activeTaskMsgIdRef.current) {
      setMessages((prev) => {
        const updated = [...prev]
        const idx = updated.findIndex((m) => m.id === activeTaskMsgIdRef.current)
        if (idx === -1) return prev
        updated[idx] = { ...updated[idx], status: "error", summary: "Cancelled by user" }
        return updated
      })
    }
    activeTaskIdRef.current = null
    activeTaskMsgIdRef.current = null
    activeAgentsRef.current = new Set()
    setIsSubmitting(false)
    setStreamStartTime(null)
    setStreamingState({ isStreaming: false, activeAgents: [] })
  }

  const handleClearHistory = () => {
    if (isSubmitting) return
    setMessages([])
    savedToMemoryRef.current = new Set()
    try { localStorage.removeItem(storageKey) } catch {}
  }

  // Derive data for fullscreen top bar
  const latestTask = [...messages].reverse().find((m) => m.type === "task")
  const latestTaskGroups = latestTask ? buildAgentGroups(latestTask.events) : []
  const currentStreamEvents = latestTask?.events ?? []

  const teamSelector = teams.length > 0 && (
    <Select value={selectedTeamId ?? "all"} onValueChange={(v) => setSelectedTeamId(v === "all" ? null : v)}>
      <SelectTrigger className="h-8 min-w-0 flex-1 font-mono text-[11px] sm:w-[180px] sm:flex-initial" size="sm"><SelectValue placeholder="Team" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all" className="font-mono text-xs">All agents (default)</SelectItem>
        {teams.map((t) => (<SelectItem key={t.id} value={t.id} className="font-mono text-xs">{t.name}</SelectItem>))}
      </SelectContent>
    </Select>
  )

  const inputBar = (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-border p-3">
      {messages.length > 0 && !isSubmitting && (
        <button
          type="button"
          onClick={handleClearHistory}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
          title="Clear chat history"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      <input
        type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)}
        placeholder="Send a research query to the swarm..."
        className="flex-1 rounded-md border border-border bg-secondary px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {isSubmitting ? (
        <button type="button" onClick={handleCancel} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/80" title="Stop task">
          <Square className="h-3.5 w-3.5" />
        </button>
      ) : (
        <button type="submit" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-50">
          <Send className="h-3.5 w-3.5" />
        </button>
      )}
    </form>
  )

  // Attach scroll listener to the Radix viewport
  useEffect(() => {
    const viewport = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null
    if (!viewport) return
    viewport.addEventListener("scroll", handleScroll, { passive: true })
    return () => viewport.removeEventListener("scroll", handleScroll)
  }, [handleScroll])

  const messageList = (
    <ScrollArea className="min-h-0 flex-1 overflow-hidden" ref={scrollRef}>
      <div className="space-y-3 p-3">
        {messages.length === 0 && (
          <p className="py-12 text-center font-mono text-xs text-muted-foreground">Send a research query to get started.</p>
        )}
        {messages.map((msg) => (<ChatBubble key={msg.id} message={msg} />))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )

  if (fullscreen) {
    return (
      <div className="flex h-full flex-col rounded-lg border border-border bg-card/80 backdrop-blur-sm">
        {/* ── Top bar ─────────────────────────────────── */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Research Console</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isSubmitting && streamStartTime && (
              <LiveStats
                eventCount={currentStreamEvents.length}
                agentCount={latestTaskGroups.length}
                startTime={streamStartTime}
              />
            )}
            <AgentStatusBar />
            {memoryEnabled && (
              <Badge variant="secondary" className="font-mono text-[9px] px-1.5 py-0 bg-primary/15 text-primary border-primary/30" title="Supermemory is active">
                <SupermemoryIcon className="h-2.5 w-2.5 mr-1" spinning={isSubmitting} />
                Supermemory
              </Badge>
            )}
            {teamSelector}
          </div>
        </div>

        {/* ── Main content: resizable two-column split ─── */}
        <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
          <ResizablePanel defaultSize={70} minSize={40}>
            <div className="flex h-full flex-col">
              {messageList}
              {inputBar}
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle className="hidden lg:flex" />
          <ResizablePanel defaultSize={30} minSize={15} className="hidden lg:block">
            <div className="flex h-full flex-col bg-card/40">
              <EventStreamPanel events={currentStreamEvents} />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    )
  }

  return (
    <Card className="flex h-full flex-col border-border bg-card/80 backdrop-blur-sm">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-border pb-3 sm:gap-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Brain className="h-3.5 w-3.5 text-primary" />
          Research Console
          {memoryEnabled && (
            <Badge variant="secondary" className="font-mono text-[9px] px-1.5 py-0 bg-primary/15 text-primary border-primary/30" title="Supermemory is active — results are saved and used for context">
              <SupermemoryIcon className="h-2.5 w-2.5 mr-1" spinning={isSubmitting} />
              Supermemory
            </Badge>
          )}
        </CardTitle>
        {teamSelector}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        {messageList}
        {inputBar}
      </CardContent>
    </Card>
  )
}
