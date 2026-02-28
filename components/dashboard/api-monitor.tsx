"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DollarSign, Zap, CheckCircle2, ListTodo } from "lucide-react"
import {
  supabaseConfigured,
  fetchDashboardStats,
  type DashboardStats,
} from "@/lib/supabase"

const COST_PER_TOKEN = 0.000015

export function ApiMonitor() {
  const [stats, setStats] = useState<DashboardStats | null>(null)

  const refresh = useCallback(async () => {
    if (!supabaseConfigured) return
    try {
      setStats(await fetchDashboardStats())
    } catch {
      // keep null
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 20000)
    return () => clearInterval(interval)
  }, [refresh])

  if (!supabaseConfigured || !stats) {
    return (
      <Card className="border-border bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Zap className="h-3.5 w-3.5 text-warning" />
            API Monitor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-4 text-center font-mono text-xs text-muted-foreground">
            {supabaseConfigured
              ? "Loading metrics..."
              : "Connect Supabase to see real metrics."}
          </p>
        </CardContent>
      </Card>
    )
  }

  const estimatedCost = stats.totalTokens * COST_PER_TOKEN

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
            <p className="font-mono text-sm font-semibold text-foreground">
              {stats.totalTokens > 1000
                ? `${(stats.totalTokens / 1000).toFixed(1)}k`
                : stats.totalTokens}
            </p>
          </div>
          <div className="space-y-1 rounded-md bg-secondary/50 px-3 py-2">
            <p className="font-mono text-[10px] uppercase text-muted-foreground">
              Est. Cost
            </p>
            <p className="flex items-center gap-1 font-mono text-sm font-semibold text-foreground">
              <DollarSign className="h-3 w-3 text-warning" />
              {estimatedCost.toFixed(2)}
            </p>
          </div>
          <div className="space-y-1 rounded-md bg-secondary/50 px-3 py-2">
            <p className="font-mono text-[10px] uppercase text-muted-foreground">
              Tasks
            </p>
            <p className="flex items-center gap-1 font-mono text-sm font-semibold text-foreground">
              <ListTodo className="h-3 w-3 text-chart-1" />
              {stats.totalTasks}
            </p>
          </div>
          <div className="space-y-1 rounded-md bg-secondary/50 px-3 py-2">
            <p className="font-mono text-[10px] uppercase text-muted-foreground">
              Completed
            </p>
            <p className="flex items-center gap-1 font-mono text-sm font-semibold text-foreground">
              <CheckCircle2 className="h-3 w-3 text-success" />
              {stats.completedTasks}
            </p>
          </div>
        </div>

        {stats.totalTokens > 0 && (
          <div className="mt-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-muted-foreground">
                Prompt / Completion split
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {((stats.promptTokens / stats.totalTokens) * 100).toFixed(0)}% /{" "}
                {((stats.completionTokens / stats.totalTokens) * 100).toFixed(0)}%
              </span>
            </div>
            <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-l-full bg-chart-1 transition-all duration-500"
                style={{ width: `${(stats.promptTokens / stats.totalTokens) * 100}%` }}
              />
              <div
                className="h-full rounded-r-full bg-chart-2 transition-all duration-500"
                style={{ width: `${(stats.completionTokens / stats.totalTokens) * 100}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
