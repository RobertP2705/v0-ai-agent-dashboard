"use client"

import { useState, useCallback, useRef } from "react"
import type { LogEntry } from "@/lib/simulation-data"

export interface SummaryEntry {
  id: string
  agent: string
  message: string
  timestamp: string
  type: "result"
}

interface MeetingSummaryState {
  summary: SummaryEntry[]
  isLoading: boolean
  error: string | null
}

export function useMeetingSummary() {
  const [state, setState] = useState<MeetingSummaryState>({
    summary: [],
    isLoading: false,
    error: null,
  })
  const abortRef = useRef<AbortController | null>(null)

  const generate = useCallback(
    async (events: LogEntry[], projectContext?: string) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setState({ summary: [], isLoading: true, error: null })

      try {
        const res = await fetch("/api/meeting/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            events: events.map((e) => ({
              agent: e.agent,
              type: e.type,
              message: e.message,
            })),
            projectContext,
          }),
          signal: controller.signal,
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Request failed" }))
          throw new Error(data.error || `HTTP ${res.status}`)
        }

        const data = await res.json()
        const conversation: { agent: string; message: string }[] =
          data.conversation ?? []

        const now = new Date()
        const entries: SummaryEntry[] = conversation.map((c, i) => ({
          id: `summary-${i}-${Date.now()}`,
          agent: c.agent,
          message: c.message,
          timestamp: new Date(now.getTime() + i * 1000)
            .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          type: "result" as const,
        }))

        setState({ summary: entries, isLoading: false, error: null })
        return entries
      } catch (err) {
        if ((err as Error).name === "AbortError") return []
        const msg = (err as Error).message || "Summarization failed"
        setState((prev) => ({ ...prev, isLoading: false, error: msg }))
        return []
      }
    },
    [],
  )

  const clear = useCallback(() => {
    abortRef.current?.abort()
    setState({ summary: [], isLoading: false, error: null })
  }, [])

  return {
    ...state,
    generate,
    clear,
  }
}
