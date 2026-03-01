"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileText, Download, Calendar, Loader2 } from "lucide-react"
import { supabaseConfigured, fetchReportsForProject, type TaskReport } from "@/lib/supabase"

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function ReportCard({ report }: { report: TaskReport }) {
  return (
    <Card className="border-border/80 bg-card/60 backdrop-blur-sm transition-all duration-200 hover:bg-card/80 hover:shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-foreground leading-snug line-clamp-2">
              {report.title || "Untitled Report"}
            </h3>
            <div className="mt-1.5 flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-3 w-3 shrink-0" />
              <span className="font-mono text-[10px]">{formatDate(report.created_at)}</span>
            </div>
          </div>
          {report.public_url && (
            <a
              href={report.public_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
              title="Download PDF"
            >
              <Download className="h-3 w-3" />
            </a>
          )}
        </div>
        {report.public_url && (
          <a
            href={report.public_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] text-primary hover:underline truncate block"
          >
            Open PDF
          </a>
        )}
      </CardContent>
    </Card>
  )
}

interface ReportsViewProps {
  projectId: string
}

export function ReportsView({ projectId }: ReportsViewProps) {
  const [reports, setReports] = useState<TaskReport[]>([])
  const [loading, setLoading] = useState(true)

  const loadReports = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchReportsForProject(projectId, 50)
      setReports(data)
    } catch {
      setReports([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (!supabaseConfigured || !projectId) {
      setLoading(false)
      return
    }
    loadReports()
  }, [projectId, loadReports])

  if (!supabaseConfigured) {
    return (
      <div className="flex items-center justify-center rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-4 py-16">
        <p className="font-mono text-xs text-muted-foreground">
          Connect Supabase to view generated reports.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-chart-1" />
        <span className="text-sm font-medium text-foreground">Generated PDF Reports</span>
        <span className="font-mono text-[10px] text-muted-foreground">
          ({reports.length})
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="ml-2 font-mono text-xs text-muted-foreground">Loading reports...</span>
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/60 bg-card/30 px-4 py-16">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/50">
            <FileText className="h-6 w-6 text-muted-foreground/30" />
          </div>
          <p className="font-mono text-xs text-muted-foreground/70">
            No PDF reports yet. Add the PDF Report Writer agent to your team and run a research query to generate reports.
          </p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {reports.map((report) => (
              <ReportCard key={report.id} report={report} />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
