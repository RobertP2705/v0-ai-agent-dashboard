"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { LogEntry } from "@/lib/simulation-data"
import type { TTSQueueControls, TTSQueueItem } from "@/hooks/use-tts-queue"
import type { SummaryEntry } from "@/hooks/use-meeting-summary"

export type AudioState = "pending" | "playing" | "played" | "cached"

export interface TranscriptEntry extends LogEntry {
  audioState: AudioState
}

function isSpeakable(event: LogEntry): boolean {
  return (
    (event.type === "thought" || event.type === "result") &&
    event.agent !== "system" &&
    event.agent !== "User" &&
    !!event.message?.trim()
  )
}

export function useMeetingTranscript(
  events: LogEntry[],
  ttsQueue: TTSQueueControls,
  enabled: boolean,
  summaryEntries?: SummaryEntry[],
) {
  const [audioStates, setAudioStates] = useState<Map<string, AudioState>>(
    new Map(),
  )
  const enqueuedRef = useRef<Set<string>>(new Set())
  const ttsQueueRef = useRef(ttsQueue)

  // Keep ref synced
  useEffect(() => {
    ttsQueueRef.current = ttsQueue
  }, [ttsQueue])

  // Wire up TTS queue callbacks to track audio states
  useEffect(() => {
    const queue = ttsQueueRef.current as TTSQueueControls & {
      onItemStart?: React.RefObject<((item: TTSQueueItem) => void) | null>
      onItemEnd?: React.RefObject<((item: TTSQueueItem) => void) | null>
    }

    if (queue.onItemStart?.current !== undefined) {
      queue.onItemStart.current = (item: TTSQueueItem) => {
        setAudioStates((prev) => {
          const next = new Map(prev)
          next.set(item.id, "playing")
          return next
        })
      }
    }

    if (queue.onItemEnd?.current !== undefined) {
      queue.onItemEnd.current = (item: TTSQueueItem) => {
        setAudioStates((prev) => {
          const next = new Map(prev)
          next.set(item.id, "played")
          return next
        })
      }
    }
  }, [])

  const useSummary = summaryEntries && summaryEntries.length > 0
  const modeRef = useRef(useSummary)

  // Reset enqueued tracking when switching between summary and raw modes
  useEffect(() => {
    if (modeRef.current !== useSummary) {
      modeRef.current = useSummary
      enqueuedRef.current = new Set()
      setAudioStates(new Map())
    }
  }, [useSummary])

  // Auto-enqueue new speakable events as they stream in
  useEffect(() => {
    if (!enabled) return

    const items: LogEntry[] = useSummary ? summaryEntries! : events.filter(isSpeakable)

    for (const event of items) {
      if (enqueuedRef.current.has(event.id)) continue
      enqueuedRef.current.add(event.id)

      setAudioStates((prev) => {
        const next = new Map(prev)
        if (!next.has(event.id)) next.set(event.id, "pending")
        return next
      })

      ttsQueueRef.current.enqueue({
        id: event.id,
        text: event.message,
        agent: event.agent,
        timestamp: event.timestamp,
      })
    }
  }, [events, enabled, useSummary, summaryEntries])

  const seekToEvent = useCallback(
    (eventId: string) => {
      ttsQueueRef.current.clearQueue()

      const items: LogEntry[] = useSummary ? summaryEntries! : events.filter(isSpeakable)
      const idx = items.findIndex((e) => e.id === eventId)
      if (idx === -1) return

      // Reset audio states from this point forward
      setAudioStates((prev) => {
        const next = new Map(prev)
        for (let i = idx; i < items.length; i++) {
          next.set(items[i].id, "pending")
        }
        return next
      })

      // Re-enqueue from this event forward
      for (let i = idx; i < items.length; i++) {
        const event = items[i]
        ttsQueueRef.current.enqueue({
          id: event.id,
          text: event.message,
          agent: event.agent,
          timestamp: event.timestamp,
        })
      }
    },
    [events, useSummary, summaryEntries],
  )

  // Build the full transcript with audio states
  const source: LogEntry[] = useSummary ? summaryEntries! : events.filter(isSpeakable)
  const transcript: TranscriptEntry[] = source.map((event) => ({
    ...event,
    audioState: audioStates.get(event.id) ?? "pending",
  }))

  return {
    transcript,
    seekToEvent,
  }
}
