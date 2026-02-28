"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { getVoiceForAgent } from "@/lib/tts-config"

export interface TTSQueueItem {
  id: string
  text: string
  agent: string
  timestamp: string
}

interface TTSState {
  currentlySpeaking: TTSQueueItem | null
  queueLength: number
  isPlaying: boolean
}

export interface TTSQueueControls {
  enqueue: (item: TTSQueueItem) => void
  pause: () => void
  resume: () => void
  skip: () => void
  clearQueue: () => void
  setPlaybackRate: (rate: number) => void
  playbackRate: number
  state: TTSState
}

async function fetchTTSAudio(
  text: string,
  voiceId: string,
): Promise<string | null> {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice_id: voiceId }),
    })
    if (!res.ok) return null
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}

export function useTTSQueue(enabled: boolean): TTSQueueControls {
  const [state, setState] = useState<TTSState>({
    currentlySpeaking: null,
    queueLength: 0,
    isPlaying: false,
  })
  const [playbackRate, setPlaybackRateState] = useState(1)

  const queueRef = useRef<TTSQueueItem[]>([])
  const isProcessingRef = useRef(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const cacheRef = useRef<Map<string, string>>(new Map())
  const prefetchingRef = useRef<Set<string>>(new Set())
  const enabledRef = useRef(enabled)
  const playbackRateRef = useRef(1)
  const onItemStartRef = useRef<((item: TTSQueueItem) => void) | null>(null)
  const onItemEndRef = useRef<((item: TTSQueueItem) => void) | null>(null)

  // Keep refs synced
  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  useEffect(() => {
    playbackRateRef.current = playbackRate
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate
    }
  }, [playbackRate])

  // Pre-fetch next 1-2 items in the queue
  const prefetchNext = useCallback(() => {
    const upcoming = queueRef.current.slice(0, 2)
    for (const item of upcoming) {
      if (cacheRef.current.has(item.id) || prefetchingRef.current.has(item.id))
        continue
      prefetchingRef.current.add(item.id)
      const { voiceId } = getVoiceForAgent(item.agent)
      fetchTTSAudio(item.text, voiceId).then((url) => {
        prefetchingRef.current.delete(item.id)
        if (url) cacheRef.current.set(item.id, url)
      })
    }
  }, [])

  const updateState = useCallback(() => {
    setState({
      currentlySpeaking: audioRef.current
        ? (queueRef.current[0] ?? null)
        : null,
      queueLength: queueRef.current.length,
      isPlaying: !!audioRef.current && !audioRef.current.paused,
    })
  }, [])

  const processQueue = useCallback(async () => {
    if (isProcessingRef.current) return
    if (queueRef.current.length === 0) {
      setState({
        currentlySpeaking: null,
        queueLength: 0,
        isPlaying: false,
      })
      return
    }

    isProcessingRef.current = true
    const item = queueRef.current[0]

    setState({
      currentlySpeaking: item,
      queueLength: queueRef.current.length,
      isPlaying: true,
    })

    onItemStartRef.current?.(item)

    // Pre-fetch upcoming items while we play this one
    prefetchNext()

    // Get audio URL from cache or fetch
    let audioUrl = cacheRef.current.get(item.id) ?? null
    if (!audioUrl) {
      const { voiceId } = getVoiceForAgent(item.agent)
      audioUrl = await fetchTTSAudio(item.text, voiceId)
      if (audioUrl) cacheRef.current.set(item.id, audioUrl)
    }

    if (!audioUrl) {
      // TTS failed, skip this item
      onItemEndRef.current?.(item)
      queueRef.current.shift()
      isProcessingRef.current = false
      processQueue()
      return
    }

    const audio = new Audio(audioUrl)
    audio.playbackRate = playbackRateRef.current
    audioRef.current = audio

    await new Promise<void>((resolve) => {
      audio.onended = () => resolve()
      audio.onerror = () => resolve()
      audio.play().catch(() => resolve())
    })

    audioRef.current = null
    onItemEndRef.current?.(item)
    queueRef.current.shift()
    isProcessingRef.current = false
    updateState()
    processQueue()
  }, [prefetchNext, updateState])

  const enqueue = useCallback(
    (item: TTSQueueItem) => {
      if (!enabledRef.current) return
      queueRef.current.push(item)
      setState((prev) => ({
        ...prev,
        queueLength: queueRef.current.length,
      }))
      // Pre-fetch this item immediately if queue is small
      if (!cacheRef.current.has(item.id) && !prefetchingRef.current.has(item.id)) {
        prefetchingRef.current.add(item.id)
        const { voiceId } = getVoiceForAgent(item.agent)
        fetchTTSAudio(item.text, voiceId).then((url) => {
          prefetchingRef.current.delete(item.id)
          if (url) cacheRef.current.set(item.id, url)
        })
      }
      if (!isProcessingRef.current) processQueue()
    },
    [processQueue],
  )

  const pause = useCallback(() => {
    audioRef.current?.pause()
    setState((prev) => ({ ...prev, isPlaying: false }))
  }, [])

  const resume = useCallback(() => {
    audioRef.current?.play()
    setState((prev) => ({ ...prev, isPlaying: true }))
  }, [])

  const skip = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
    const skipped = queueRef.current.shift()
    if (skipped) onItemEndRef.current?.(skipped)
    isProcessingRef.current = false
    updateState()
    processQueue()
  }, [updateState, processQueue])

  const clearQueue = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current.pause()
      audioRef.current = null
    }
    queueRef.current = []
    isProcessingRef.current = false
    setState({
      currentlySpeaking: null,
      queueLength: 0,
      isPlaying: false,
    })
  }, [])

  const setPlaybackRate = useCallback((rate: number) => {
    setPlaybackRateState(rate)
  }, [])

  // Expose callbacks for meeting transcript integration
  const controls: TTSQueueControls & {
    onItemStart: typeof onItemStartRef
    onItemEnd: typeof onItemEndRef
    cache: typeof cacheRef
  } = {
    enqueue,
    pause,
    resume,
    skip,
    clearQueue,
    setPlaybackRate,
    playbackRate,
    state,
    onItemStart: onItemStartRef,
    onItemEnd: onItemEndRef,
    cache: cacheRef,
  }

  return controls
}
