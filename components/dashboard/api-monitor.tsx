"use client"

import { useEffect, useState, useCallback } from "react"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DollarSign, Zap, TrendingUp, ArrowUpRight } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface ApiStats {
  totalTokens: number
  inputTokens: number
  outputTokens: number
  estimatedCost: number
  requestsPerMin: number
}

const fallbackStats: ApiStats = {
  totalTokens: 1247832,
  inputTokens: 834221,
  outputTokens: 413611,
  estimatedCost: 18.72,
  requestsPerMin: 24,
}

export function ApiMonitor() {
  const { data: dbStats } = useSWR<ApiStats>("/api/api-stats", fetcher, {
    refreshInterval: 5000,
    fallbackData: undefined,
  })

  const [stats, setStats] = useState<ApiStats>(fallbackStats)
  const initializedRef = { current: false }

  useEffect(() => {
    if (dbStats && dbStats.totalTokens && !initializedRef.current) {
      initializedRef.current = true
      setStats(dbStats)
    }
  }, [dbStats])

  const updateStats = useCallback(() => {
    setStats((prev) => {
      const newInput = prev.inputTokens + Math.floor(Math.random() * 500)
      const newOutput = prev.outputTokens + Math.floor(Math.random() * 250)
      const updated = {
        totalTokens: newInput + newOutput,
        inputTokens: newInput,
        outputTokens: newOutput,
        estimatedCost: Number(((newInput + newOutput) * 0.000015).toFixed(2)),
        requestsPerMin: Math.floor(20 + Math.random() * 15),
      }

      // Persist every 10 seconds worth of updates (every 5th call at 2s interval)
      if (Math.random() < 0.2) {
        fetch("/api/api-stats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        }).catch(() => {})
      }

      return updated
    })
  }, [])

  useEffect(() => {
    const interval = setInterval(updateStats, 2000)
    return () => clearInterval(interval)
  }, [updateStats])

  return (
    <Card className="border-border bg-card/80 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Zap className="h-3.5 w-3.5 text-warning" />
          API Monitor
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="space-y-1 rounded-md bg-secondary/50 px-3 py-2">
            <p className="font-mono text-[10px] uppercase text-muted-foreground">
              Total Tokens
            </p>
            <p className="flex items-baseline gap-1 font-mono text-sm font-semibold text-foreground">
              {(stats.totalTokens / 1000).toFixed(1)}k
              <ArrowUpRight className="h-3 w-3 text-success" />
            </p>
          </div>
          <div className="space-y-1 rounded-md bg-secondary/50 px-3 py-2">
            <p className="font-mono text-[10px] uppercase text-muted-foreground">
              Est. Cost
            </p>
            <p className="flex items-center gap-1 font-mono text-sm font-semibold text-foreground">
              <DollarSign className="h-3 w-3 text-warning" />
              {stats.estimatedCost.toFixed(2)}
            </p>
          </div>
          <div className="space-y-1 rounded-md bg-secondary/50 px-3 py-2">
            <p className="font-mono text-[10px] uppercase text-muted-foreground">
              Req/min
            </p>
            <p className="flex items-baseline gap-1 font-mono text-sm font-semibold text-foreground">
              {stats.requestsPerMin}
              <TrendingUp className="h-3 w-3 text-chart-1" />
            </p>
          </div>
          <div className="space-y-1 rounded-md bg-secondary/50 px-3 py-2">
            <p className="font-mono text-[10px] uppercase text-muted-foreground">
              I/O Split
            </p>
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-chart-1 transition-all duration-500"
                  style={{
                    width: `${(stats.inputTokens / stats.totalTokens) * 100}%`,
                  }}
                />
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">
                {((stats.inputTokens / stats.totalTokens) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
