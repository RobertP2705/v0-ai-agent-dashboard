"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { DollarSign, Key, Webhook, ExternalLink } from "lucide-react"
import {
  supabaseConfigured,
  fetchDashboardStats,
  type DashboardStats,
} from "@/lib/supabase"

const COST_PER_TOKEN = 0.000015

export function ApiCreditsView() {
  const [stats, setStats] = useState<DashboardStats | null>(null)

  const refresh = useCallback(async () => {
    if (!supabaseConfigured) return
    try {
      setStats(await fetchDashboardStats())
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 30000)
    return () => clearInterval(interval)
  }, [refresh])

  const tokenCost = stats ? (stats.totalTokens * COST_PER_TOKEN).toFixed(2) : "0.00"

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card className="border-border bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Key className="h-3.5 w-3.5 text-warning" />
              API Keys
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { name: "Hugging Face (Qwen3-32B)", status: "active", key: "hf_...configured" },
              { name: "Supabase", status: supabaseConfigured ? "active" : "missing", key: supabaseConfigured ? "sb_...configured" : "Not configured" },
              { name: "Tavily Search API", status: "active", key: "tvly-...configured" },
              { name: "GitHub API", status: "active", key: "ghp_...configured" },
              { name: "Weights & Biases", status: "active", key: "wandb_...configured" },
              { name: "ElevenLabs TTS", status: "placeholder", key: "Not configured" },
            ].map((api) => (
              <div
                key={api.name}
                className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2"
              >
                <div>
                  <p className="text-xs font-medium text-foreground">{api.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{api.key}</p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    api.status === "active"
                      ? "border-success/30 bg-success/10 font-mono text-[10px] text-success"
                      : api.status === "missing"
                        ? "border-destructive/30 bg-destructive/10 font-mono text-[10px] text-destructive"
                        : "border-warning/30 bg-warning/10 font-mono text-[10px] text-warning"
                  }
                >
                  {api.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Webhook className="h-3.5 w-3.5 text-chart-2" />
              Endpoints
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="rounded-md border border-border bg-secondary/30 px-3 py-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-foreground">Modal Research Swarm</p>
                <Badge
                  variant="outline"
                  className="border-success/30 bg-success/10 font-mono text-[10px] text-success"
                >
                  active
                </Badge>
              </div>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                POST $MODAL_ENDPOINT_URL/research/stream
              </p>
              <p className="mt-1 font-mono text-[9px] text-muted-foreground/70">
                Qwen3-32B on A100 80GB via vLLM &middot; 3 agents &middot; Modal Sandbox &middot; W&amp;B &middot; GitHub
              </p>
            </div>
            <div className="rounded-md border border-border bg-secondary/30 px-3 py-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-foreground">Supabase Realtime</p>
                <Badge
                  variant="outline"
                  className={
                    supabaseConfigured
                      ? "border-success/30 bg-success/10 font-mono text-[10px] text-success"
                      : "border-warning/30 bg-warning/10 font-mono text-[10px] text-warning"
                  }
                >
                  {supabaseConfigured ? "connected" : "not configured"}
                </Badge>
              </div>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                tasks, task_events, papers, experiments
              </p>
            </div>
            <a
              href="#"
              className="flex items-center gap-1 text-[10px] text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              View integration documentation
            </a>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <DollarSign className="h-3.5 w-3.5 text-warning" />
            Usage Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!stats ? (
            <p className="py-4 text-center font-mono text-xs text-muted-foreground">
              {supabaseConfigured ? "Loading usage data..." : "Connect Supabase to see usage data."}
            </p>
          ) : (
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-3 py-1.5 text-left font-mono text-[10px] uppercase text-muted-foreground">
                      Metric
                    </th>
                    <th className="px-3 py-1.5 text-right font-mono text-[10px] uppercase text-muted-foreground">
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/50">
                    <td className="px-3 py-1.5 font-mono text-xs text-foreground">Total Tasks</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">{stats.totalTasks}</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="px-3 py-1.5 font-mono text-xs text-foreground">Completed</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">{stats.completedTasks}</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="px-3 py-1.5 font-mono text-xs text-foreground">Prompt Tokens</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">
                      {stats.promptTokens > 1000 ? `${(stats.promptTokens / 1000).toFixed(1)}k` : stats.promptTokens}
                    </td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="px-3 py-1.5 font-mono text-xs text-foreground">Completion Tokens</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">
                      {stats.completionTokens > 1000 ? `${(stats.completionTokens / 1000).toFixed(1)}k` : stats.completionTokens}
                    </td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="px-3 py-1.5 font-mono text-xs text-foreground">Papers Collected</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">{stats.totalPapers}</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="px-3 py-1.5 font-mono text-xs text-foreground">Experiments Run</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">{stats.totalExperiments}</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="px-3 py-1.5 font-mono text-xs text-foreground">Research Directions</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">{stats.totalDirections}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-1.5 font-mono text-xs font-medium text-foreground">Est. Token Cost</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs font-medium text-foreground">${tokenCost}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
