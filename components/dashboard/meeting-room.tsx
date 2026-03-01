"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import {
  Mic,
  MicOff,
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Clock,
  Check,
  Volume2,
  BookOpen,
  Terminal,
  Compass,
  Sparkles,
  Loader2,
  Info,
  MessageSquare,
} from "lucide-react"
import { useStreaming } from "@/lib/streaming-context"
import { getAgentColor } from "@/lib/simulation-data"
import { useTTSQueue } from "@/hooks/use-tts-queue"
import { useMeetingTranscript, type TranscriptEntry } from "@/hooks/use-meeting-transcript"
import { useMeetingSummary } from "@/hooks/use-meeting-summary"
import { getVoiceForAgent } from "@/lib/tts-config"

// ── Agent icon map (same as chat-interface) ────────────────────────────────

const agentIconMap: Record<string, React.ElementType> = {
  "Paper Collector": BookOpen,
  "paper-collector": BookOpen,
  Implementer: Terminal,
  implementer: Terminal,
  "Research Director": Compass,
  "research-director": Compass,
}

function getAgentIcon(agent: string): React.ElementType {
  const base = agent.replace(/ #\d+$/, "")
  return agentIconMap[base] ?? Mic
}

// ── Agent avatar badge color (bg variant) ────────────────────────────────

function getAgentBgColor(agent: string): string {
  const colors: Record<string, string> = {
    "Paper Collector": "bg-chart-1/15 border-chart-1/30",
    "paper-collector": "bg-chart-1/15 border-chart-1/30",
    Implementer: "bg-chart-2/15 border-chart-2/30",
    implementer: "bg-chart-2/15 border-chart-2/30",
    "Research Director": "bg-chart-3/15 border-chart-3/30",
    "research-director": "bg-chart-3/15 border-chart-3/30",
  }
  const base = agent.replace(/ #\d+$/, "")
  return colors[base] ?? "bg-muted border-border"
}

// ── Sound wave animation ───────────────────────────────────────────────────

function SoundWave({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-end gap-[2px]", className)}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className="inline-block w-[3px] rounded-full bg-primary"
          style={{
            animation: `soundWave 0.6s ease-in-out ${i * 0.15}s infinite alternate`,
          }}
        />
      ))}
      <style>{`
        @keyframes soundWave {
          0% { height: 4px; }
          100% { height: 14px; }
        }
      `}</style>
    </div>
  )
}

// ── Compact markdown renderer ──────────────────────────────────────────────

function TranscriptMd({ children }: { children: string }) {
  const hasMarkdown = /[#*`\[\]|>-]/.test(children)
  if (!hasMarkdown) {
    return <span className="text-foreground/85 leading-relaxed">{children}</span>
  }
  return (
    <div className="prose prose-sm prose-invert max-w-none
      prose-p:text-xs prose-p:text-foreground/85 prose-p:leading-relaxed prose-p:my-0.5
      prose-code:text-[10px] prose-code:bg-secondary prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-primary
      prose-strong:text-foreground prose-strong:font-semibold
      prose-ul:text-xs prose-ul:my-0.5 prose-ol:text-xs prose-ol:my-0.5
      prose-li:text-foreground/85 prose-li:my-0
    ">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}

// ── Audio state indicator ──────────────────────────────────────────────────

function AudioStateIcon({ audioState }: { audioState: TranscriptEntry["audioState"] }) {
  switch (audioState) {
    case "pending":
      return <Clock className="h-3 w-3 text-muted-foreground/50" />
    case "playing":
      return <SoundWave className="h-3.5" />
    case "played":
      return <Check className="h-3 w-3 text-success" />
    case "cached":
      return (
        <span className="flex items-center gap-0.5">
          <Check className="h-2.5 w-2.5 text-success" />
          <Volume2 className="h-2.5 w-2.5 text-success" />
        </span>
      )
    default:
      return null
  }
}

// ── Transcript entry row ───────────────────────────────────────────────────

function TranscriptRow({
  entry,
  isActive,
  onClick,
}: {
  entry: TranscriptEntry
  isActive: boolean
  onClick: () => void
}) {
  const Icon = getAgentIcon(entry.agent)
  const agentColor = getAgentColor(entry.agent)
  const bgColor = getAgentBgColor(entry.agent)

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-all",
        isActive
          ? "border-l-2 border-l-primary bg-primary/5"
          : "border-l-2 border-l-transparent hover:bg-secondary/40",
      )}
    >
      {/* Timestamp */}
      <span className="shrink-0 pt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground/60">
        {entry.timestamp}
      </span>

      {/* Agent avatar */}
      <div
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
          bgColor,
        )}
      >
        <Icon className={cn("h-3 w-3", agentColor)} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className={cn("font-mono text-[9px] px-1.5 py-0", agentColor)}
          >
            {entry.agent}
          </Badge>
          <Badge
            variant="outline"
            className="font-mono text-[8px] px-1 py-0 text-muted-foreground"
          >
            {entry.type}
          </Badge>
        </div>
        <div className="mt-1 font-mono text-xs">
          <TranscriptMd>{entry.message}</TranscriptMd>
        </div>
      </div>

      {/* Audio state indicator */}
      <div className="shrink-0 pt-1">
        <AudioStateIcon audioState={entry.audioState} />
      </div>
    </button>
  )
}

// ── Playback speed selector ────────────────────────────────────────────────

const SPEEDS = [1, 1.25, 1.5, 2] as const

function SpeedSelector({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-0.5">
      {SPEEDS.map((speed) => (
        <button
          key={speed}
          type="button"
          onClick={() => onChange(speed)}
          className={cn(
            "rounded px-1.5 py-0.5 font-mono text-[9px] transition-colors",
            value === speed
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
          )}
        >
          {speed}x
        </button>
      ))}
    </div>
  )
}

// ── TTS API key check ──────────────────────────────────────────────────────

function useTTSAvailable() {
  const [available, setAvailable] = useState<boolean | null>(null)
  useEffect(() => {
    fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "test", voice_id: "test" }),
    }).then((res) => {
      // 500 with "ELEVENLABS_API_KEY is not configured" means key not set
      // Any other error or success means key is set
      if (res.status === 500) {
        res.json().then((data) => {
          setAvailable(!data.error?.includes("not configured"))
        }).catch(() => setAvailable(false))
      } else {
        setAvailable(true)
      }
    }).catch(() => setAvailable(false))
  }, [])
  return available
}

// ── Main MeetingRoom ───────────────────────────────────────────────────────

interface MeetingRoomProps {
  projectId?: string
  teamId?: string
}

export function MeetingRoom({ projectId, teamId }: MeetingRoomProps = {}) {
  const { isStreaming, currentEvents } = useStreaming()
  const [ttsEnabled, setTtsEnabled] = useState(true)
  const [volume, setVolume] = useState([80])
  const [wasStreaming, setWasStreaming] = useState(false)
  const [meetingConcluded, setMeetingConcluded] = useState(false)
  const ttsAvailable = useTTSAvailable()

  const meetingSummary = useMeetingSummary()
  const showSummary = meetingSummary.summary.length > 0

  const effectiveTtsEnabled = ttsEnabled && ttsAvailable === true
  const ttsQueue = useTTSQueue(effectiveTtsEnabled)
  const { transcript, seekToEvent } = useMeetingTranscript(
    currentEvents,
    ttsQueue,
    effectiveTtsEnabled,
    showSummary ? meetingSummary.summary : undefined,
  )

  // Track scroll behavior
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const userScrolledUpRef = useRef(false)
  const hasAutoSummarizedRef = useRef(false)
  const prevShowSummaryRef = useRef(false)

  // Detect meeting concluded (streaming went from true to false)
  useEffect(() => {
    if (isStreaming) {
      setWasStreaming(true)
      setMeetingConcluded(false)
      hasAutoSummarizedRef.current = false
    } else if (wasStreaming && !isStreaming) {
      setMeetingConcluded(true)
    }
  }, [isStreaming, wasStreaming])

  // Auto-run summarization when meeting concludes so TTS reads summary (each agent's perspective) instead of raw script
  useEffect(() => {
    if (
      meetingConcluded &&
      currentEvents.length > 0 &&
      !showSummary &&
      !meetingSummary.isLoading &&
      !meetingSummary.error &&
      !hasAutoSummarizedRef.current
    ) {
      hasAutoSummarizedRef.current = true
      meetingSummary.generate(currentEvents, projectId ?? undefined)
    }
  }, [meetingConcluded, currentEvents.length, showSummary, meetingSummary.isLoading, meetingSummary.error, meetingSummary.generate, projectId])

  // When switching to summary mode, clear TTS queue so only the summarized conversation is read (not the raw script)
  useEffect(() => {
    if (showSummary && !prevShowSummaryRef.current) {
      ttsQueue.clearQueue()
    }
    prevShowSummaryRef.current = showSummary
  }, [showSummary, ttsQueue])

  // Auto-scroll to currently playing entry
  useEffect(() => {
    if (!userScrolledUpRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [transcript.length, ttsQueue.state.currentlySpeaking?.id])

  const handleScroll = useCallback(() => {
    const viewport = scrollRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]",
    ) as HTMLElement | null
    if (!viewport) return
    const distFromBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
    userScrolledUpRef.current = distFromBottom > 150
  }, [])

  // Attach scroll listener
  useEffect(() => {
    const viewport = scrollRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]",
    ) as HTMLElement | null
    if (!viewport) return
    viewport.addEventListener("scroll", handleScroll, { passive: true })
    return () => viewport.removeEventListener("scroll", handleScroll)
  }, [handleScroll])

  // Volume control
  useEffect(() => {
    const audioElements = document.querySelectorAll("audio")
    audioElements.forEach((el) => {
      el.volume = volume[0] / 100
    })
  }, [volume])

  // Currently speaking agent info
  const currentAgent = ttsQueue.state.currentlySpeaking?.agent ?? null
  const currentVoiceLabel = currentAgent
    ? getVoiceForAgent(currentAgent).label
    : null

  // Empty state
  if (currentEvents.length === 0 && !isStreaming) {
    return (
      <div className="flex min-h-full flex-col gap-3">
        <Card className="flex flex-1 flex-col items-center justify-center border border-dashed border-muted-foreground/30 bg-card/80">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12">
            <Mic className="h-10 w-10 text-muted-foreground/50" />
            <p className="font-mono text-xs text-muted-foreground">
              Start a research query to begin the meeting.
            </p>
            {ttsAvailable === false && (
              <Badge
                variant="outline"
                className="font-mono text-[10px] text-warning border-warning/30"
              >
                Set ELEVENLABS_API_KEY to enable voice playback
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card/80 backdrop-blur-sm">
      {/* ── Header bar ───────────────────────────────────────────────── */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">
              Research Meeting
            </span>
          </div>

          {isStreaming && (
            <Badge className="bg-success/15 text-success border-success/30 font-mono text-[9px] px-1.5 py-0">
              <span className="relative mr-1.5 flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
              </span>
              LIVE
            </Badge>
          )}

          {meetingConcluded && !isStreaming && transcript.length > 0 && !showSummary && (
            <Badge
              variant="outline"
              className="font-mono text-[9px] text-muted-foreground"
            >
              Meeting concluded
            </Badge>
          )}

          {showSummary && (
            <Badge className="bg-primary/15 text-primary border-primary/30 font-mono text-[9px] px-1.5 py-0">
              <Sparkles className="mr-1 h-2.5 w-2.5" />
              Summary
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Currently speaking indicator */}
          {ttsQueue.state.currentlySpeaking && (
            <div className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-2.5 py-1">
              <SoundWave className="h-3" />
              <span
                className={cn(
                  "font-mono text-[10px] font-medium",
                  getAgentColor(currentAgent!),
                )}
              >
                {currentAgent}
              </span>
              <span className="font-mono text-[9px] text-muted-foreground">
                ({currentVoiceLabel})
              </span>
            </div>
          )}

          {/* TTS not available banner */}
          {ttsAvailable === false && (
            <Badge
              variant="outline"
              className="font-mono text-[9px] text-warning border-warning/30"
            >
              TTS unavailable
            </Badge>
          )}

          {/* Volume slider */}
          {ttsAvailable !== false && (
            <div className="hidden items-center gap-1.5 sm:flex">
              <Volume2 className="h-3 w-3 text-muted-foreground" />
              <Slider
                value={volume}
                onValueChange={setVolume}
                max={100}
                step={5}
                className="w-16"
              />
            </div>
          )}

          {/* Mute/unmute toggle */}
          <button
            type="button"
            onClick={() => setTtsEnabled(!ttsEnabled)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md border transition-colors",
              ttsEnabled
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border bg-secondary text-muted-foreground",
            )}
            title={ttsEnabled ? "Mute TTS" : "Unmute TTS"}
            disabled={ttsAvailable === false}
          >
            {ttsEnabled ? (
              <Mic className="h-3.5 w-3.5" />
            ) : (
              <MicOff className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* ── Summary prompt / loading ────────────────────────────────── */}
      {!isStreaming && currentEvents.length > 0 && !showSummary && !meetingSummary.isLoading && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-secondary/30 px-4 py-2">
          <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="font-mono text-[10px] text-muted-foreground">
            Summarizes your chat history into a conversation between agents
          </span>
          <button
            type="button"
            onClick={() => meetingSummary.generate(currentEvents)}
            className="ml-auto flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 font-mono text-[10px] font-medium text-primary transition-colors hover:bg-primary/20"
          >
            <Sparkles className="h-3 w-3" />
            Generate Summary
          </button>
        </div>
      )}

      {meetingSummary.isLoading && (
        <div className="flex shrink-0 items-center justify-center gap-2 border-b border-border bg-secondary/30 px-4 py-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <span className="font-mono text-[10px] text-muted-foreground">
            Summarizing research discussion...
          </span>
        </div>
      )}

      {meetingSummary.error && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-destructive/5 px-4 py-2">
          <span className="font-mono text-[10px] text-destructive">
            {meetingSummary.error}
          </span>
          <button
            type="button"
            onClick={() => meetingSummary.generate(currentEvents)}
            className="ml-auto font-mono text-[10px] text-primary underline"
          >
            Retry
          </button>
        </div>
      )}

      {showSummary && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-primary/5 px-4 py-1.5">
          <MessageSquare className="h-3 w-3 text-primary/70" />
          <span className="font-mono text-[10px] text-muted-foreground">
            AI-generated conversation from your chat history
          </span>
          <button
            type="button"
            onClick={() => {
              ttsQueue.clearQueue()
              meetingSummary.clear()
            }}
            className="ml-auto font-mono text-[10px] text-muted-foreground underline hover:text-foreground"
          >
            Show raw events
          </button>
        </div>
      )}

      {/* ── Main transcript area ─────────────────────────────────────── */}
      <ScrollArea className="min-h-0 flex-1" ref={scrollRef}>
        <div className="space-y-0.5 p-2">
          {transcript.length === 0 && isStreaming && (
            <p className="py-12 text-center font-mono text-xs text-muted-foreground">
              Waiting for agents to speak...
            </p>
          )}

          {transcript.map((entry) => (
            <TranscriptRow
              key={entry.id}
              entry={entry}
              isActive={ttsQueue.state.currentlySpeaking?.id === entry.id}
              onClick={() => seekToEvent(entry.id)}
            />
          ))}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* ── Bottom control bar ───────────────────────────────────────── */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2">
        <div className="flex items-center gap-1.5">
          {/* Play / Pause */}
          <button
            type="button"
            onClick={() =>
              ttsQueue.state.isPlaying ? ttsQueue.pause() : ttsQueue.resume()
            }
            disabled={
              !ttsQueue.state.currentlySpeaking && ttsQueue.state.queueLength === 0
            }
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
              ttsQueue.state.isPlaying
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border bg-secondary text-foreground hover:bg-secondary/80",
              "disabled:opacity-40 disabled:cursor-not-allowed",
            )}
            title={ttsQueue.state.isPlaying ? "Pause" : "Play"}
          >
            {ttsQueue.state.isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </button>

          {/* Skip */}
          <button
            type="button"
            onClick={ttsQueue.skip}
            disabled={!ttsQueue.state.currentlySpeaking}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-secondary text-foreground transition-colors hover:bg-secondary/80 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Skip to next"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>

          {/* Replay from start */}
          {meetingConcluded && transcript.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (transcript.length > 0) seekToEvent(transcript[0].id)
              }}
              className="flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-1.5 font-mono text-[10px] text-foreground transition-colors hover:bg-secondary/80"
              title="Replay from start"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Replay</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Queue indicator */}
          {ttsQueue.state.queueLength > 0 && (
            <Badge
              variant="outline"
              className="font-mono text-[9px] px-1.5 py-0 text-muted-foreground"
            >
              {ttsQueue.state.queueLength} in queue
            </Badge>
          )}

          {/* Transcript count */}
          <Badge
            variant="outline"
            className="font-mono text-[9px] px-1.5 py-0 text-muted-foreground"
          >
            {transcript.length} {showSummary ? "summary" : ""} entries
          </Badge>

          {/* Playback speed */}
          <SpeedSelector
            value={ttsQueue.playbackRate}
            onChange={ttsQueue.setPlaybackRate}
          />
        </div>
      </div>
    </div>
  )
}
