"use client"

import { useEffect, useState, useCallback } from "react"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { BarChart3, DollarSign, Coins } from "lucide-react"
import type { TokenUsagePoint } from "@/lib/simulation-data"
import { generateTokenUsage } from "@/lib/simulation-data"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-lg">
      <p className="font-mono text-[10px] text-muted-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="font-mono text-xs" style={{ color: p.color }}>
          {p.name}: {p.value.toLocaleString()} tokens
        </p>
      ))}
    </div>
  )
}

export function TokenUsageChart() {
  const { data: dbData } = useSWR<TokenUsagePoint[]>("/api/token-usage", fetcher, {
    refreshInterval: 6000,
    fallbackData: undefined,
  })

  const [data, setData] = useState<TokenUsagePoint[]>([])
  const initializedRef = { current: false }

  useEffect(() => {
    if (dbData && Array.isArray(dbData) && dbData.length > 0 && !initializedRef.current) {
      initializedRef.current = true
      setData(dbData)
    } else if (!dbData && data.length === 0) {
      setData(generateTokenUsage())
    }
  }, [dbData, data.length])

  const updateData = useCallback(() => {
    setData((prev) => {
      if (prev.length === 0) return prev
      const newPoint: TokenUsagePoint = {
        time: new Date().toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
        }),
        input: Math.floor(800 + Math.random() * 2400),
        output: Math.floor(400 + Math.random() * 1200),
      }

      // Persist new data point to Supabase
      fetch("/api/token-usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPoint),
      }).catch(() => {})

      return [...prev.slice(1), newPoint]
    })
  }, [])

  useEffect(() => {
    const interval = setInterval(updateData, 5000)
    return () => clearInterval(interval)
  }, [updateData])

  const totalInput = data.reduce((sum, d) => sum + d.input, 0)
  const totalOutput = data.reduce((sum, d) => sum + d.output, 0)
  const totalCost = ((totalInput + totalOutput) * 0.000015).toFixed(2)

  return (
    <Card className="border-border bg-card/80 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <BarChart3 className="h-3.5 w-3.5 text-chart-2" />
            Token Usage Over Time
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Coins className="h-3 w-3 text-chart-1" />
              <span className="font-mono text-[10px] text-muted-foreground">
                {(totalInput / 1000).toFixed(0)}k in
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Coins className="h-3 w-3 text-chart-2" />
              <span className="font-mono text-[10px] text-muted-foreground">
                {(totalOutput / 1000).toFixed(0)}k out
              </span>
            </div>
            <div className="flex items-center gap-1">
              <DollarSign className="h-3 w-3 text-warning" />
              <span className="font-mono text-[10px] font-medium text-foreground">
                ${totalCost}
              </span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="inputGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="oklch(0.72 0.19 160)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="oklch(0.72 0.19 160)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="outputGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="oklch(0.65 0.17 250)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="oklch(0.65 0.17 250)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.01 260)" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 9, fontFamily: "var(--font-mono)", fill: "oklch(0.60 0.02 250)" }}
              stroke="oklch(0.25 0.01 260)"
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 9, fontFamily: "var(--font-mono)", fill: "oklch(0.60 0.02 250)" }}
              stroke="oklch(0.25 0.01 260)"
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="input"
              name="Input"
              stroke="oklch(0.72 0.19 160)"
              fill="url(#inputGrad)"
              strokeWidth={1.5}
            />
            <Area
              type="monotone"
              dataKey="output"
              name="Output"
              stroke="oklch(0.65 0.17 250)"
              fill="url(#outputGrad)"
              strokeWidth={1.5}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
