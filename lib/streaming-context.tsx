"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"

interface StreamingState {
  isStreaming: boolean
  activeAgents: string[]
}

interface StreamingContextValue extends StreamingState {
  setStreamingState: (state: Partial<StreamingState>) => void
}

const StreamingContext = createContext<StreamingContextValue>({
  isStreaming: false,
  activeAgents: [],
  setStreamingState: () => {},
})

export function StreamingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StreamingState>({
    isStreaming: false,
    activeAgents: [],
  })

  const setStreamingState = useCallback((partial: Partial<StreamingState>) => {
    setState((prev) => ({ ...prev, ...partial }))
  }, [])

  return (
    <StreamingContext.Provider value={{ ...state, setStreamingState }}>
      {children}
    </StreamingContext.Provider>
  )
}

export function useStreaming() {
  return useContext(StreamingContext)
}
