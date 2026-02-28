"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TokenUsageChart } from "./token-usage-chart"
import { DollarSign, Key, Webhook, ExternalLink } from "lucide-react"

export function ApiCreditsView() {
  return (
    <div className="flex flex-col gap-4">
      <TokenUsageChart />

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
              { name: "OpenAI GPT-4o", status: "active", key: "sk-...7x4R" },
              { name: "Anthropic Claude", status: "active", key: "sk-...9mK2" },
              {
                name: "ElevenLabs TTS",
                status: "placeholder",
                key: "Not configured",
              },
            ].map((api) => (
              <div
                key={api.name}
                className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2"
              >
                <div>
                  <p className="text-xs font-medium text-foreground">
                    {api.name}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {api.key}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    api.status === "active"
                      ? "border-success/30 bg-success/10 font-mono text-[10px] text-success"
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
              Webhooks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="rounded-md border border-border bg-secondary/30 px-3 py-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-foreground">
                  Modal.com Webhook
                </p>
                <Badge
                  variant="outline"
                  className="border-warning/30 bg-warning/10 font-mono text-[10px] text-warning"
                >
                  placeholder
                </Badge>
              </div>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                POST https://your-app.modal.run/webhook
              </p>
              <p className="mt-1 font-mono text-[9px] text-muted-foreground/70">
                Connect Modal.com to receive GPU job completions and model
                inference results
              </p>
            </div>
            <div className="rounded-md border border-border bg-secondary/30 px-3 py-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-foreground">
                  ElevenLabs Stream
                </p>
                <Badge
                  variant="outline"
                  className="border-warning/30 bg-warning/10 font-mono text-[10px] text-warning"
                >
                  placeholder
                </Badge>
              </div>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                wss://api.elevenlabs.io/v1/text-to-speech
              </p>
              <p className="mt-1 font-mono text-[9px] text-muted-foreground/70">
                WebSocket connection for real-time agent voice synthesis
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
            Cost Breakdown (Current Session)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-3 py-1.5 text-left font-mono text-[10px] uppercase text-muted-foreground">
                    Model
                  </th>
                  <th className="px-3 py-1.5 text-right font-mono text-[10px] uppercase text-muted-foreground">
                    Requests
                  </th>
                  <th className="px-3 py-1.5 text-right font-mono text-[10px] uppercase text-muted-foreground">
                    Tokens
                  </th>
                  <th className="px-3 py-1.5 text-right font-mono text-[10px] uppercase text-muted-foreground">
                    Cost
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    model: "gpt-4o",
                    requests: 342,
                    tokens: "847.2k",
                    cost: "$12.71",
                  },
                  {
                    model: "claude-3.5-sonnet",
                    requests: 128,
                    tokens: "312.8k",
                    cost: "$4.69",
                  },
                  {
                    model: "text-embedding-3",
                    requests: 1247,
                    tokens: "87.4k",
                    cost: "$1.31",
                  },
                ].map((row) => (
                  <tr key={row.model} className="border-b border-border/50">
                    <td className="px-3 py-1.5 font-mono text-xs text-foreground">
                      {row.model}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">
                      {row.requests}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">
                      {row.tokens}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs font-medium text-foreground">
                      {row.cost}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
