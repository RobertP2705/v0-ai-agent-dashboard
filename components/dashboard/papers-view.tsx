"use client"

import { useEffect, useState, useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  FileText,
  ExternalLink,
  Download,
  Search,
  ChevronDown,
  BookOpen,
  Users,
  Calendar,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { supabaseConfigured, fetchPapers, type Paper } from "@/lib/supabase"

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function PaperCard({ paper }: { paper: Paper }) {
  const [showAbstract, setShowAbstract] = useState(false)
  const [showSummary, setShowSummary] = useState(false)

  const authorText = paper.authors?.length
    ? paper.authors.length > 3
      ? `${paper.authors.slice(0, 3).join(", ")} +${paper.authors.length - 3} more`
      : paper.authors.join(", ")
    : "Unknown authors"

  return (
    <Card className="border-border bg-card/80 backdrop-blur-sm transition-colors hover:bg-card/90">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-foreground leading-snug line-clamp-2">
              {paper.title || "Untitled Paper"}
            </h3>
            <div className="mt-1.5 flex items-center gap-2 text-muted-foreground">
              <Users className="h-3 w-3 shrink-0" />
              <p className="font-mono text-[10px] truncate">{authorText}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {paper.arxiv_id && (
              <a
                href={`https://arxiv.org/abs/${paper.arxiv_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
                title="View on arXiv"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {paper.pdf_url && (
              <a
                href={paper.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
                title="Download PDF"
              >
                <Download className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {paper.arxiv_id && (
            <Badge variant="outline" className="font-mono text-[9px] px-1.5 py-0">
              {paper.arxiv_id}
            </Badge>
          )}
          <div className="flex items-center gap-1 text-muted-foreground">
            <Calendar className="h-2.5 w-2.5" />
            <span className="font-mono text-[10px]">{formatDate(paper.created_at)}</span>
          </div>
        </div>

        {paper.abstract && (
          <Collapsible open={showAbstract} onOpenChange={setShowAbstract}>
            <CollapsibleTrigger className="flex items-center gap-1.5 font-mono text-[10px] text-primary hover:text-primary/80 transition-colors">
              <ChevronDown className={cn("h-3 w-3 transition-transform", showAbstract && "rotate-180")} />
              Abstract
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1.5">
              <div className="rounded-md border border-border bg-secondary/30 p-3">
                <p className="font-mono text-[11px] text-foreground/70 leading-relaxed">
                  {paper.abstract}
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {paper.summary && (
          <Collapsible open={showSummary} onOpenChange={setShowSummary}>
            <CollapsibleTrigger className="flex items-center gap-1.5 font-mono text-[10px] text-chart-2 hover:text-chart-2/80 transition-colors">
              <ChevronDown className={cn("h-3 w-3 transition-transform", showSummary && "rotate-180")} />
              AI Summary
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1.5">
              <div className="rounded-md border border-chart-2/20 bg-chart-2/5 p-3">
                <p className="font-mono text-[11px] text-foreground/70 leading-relaxed">
                  {paper.summary}
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  )
}

export function PapersView() {
  const [papers, setPapers] = useState<Paper[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false)
      return
    }
    fetchPapers(200)
      .then(setPapers)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return papers
    const q = searchQuery.toLowerCase()
    return papers.filter(
      (p) =>
        p.title?.toLowerCase().includes(q) ||
        p.abstract?.toLowerCase().includes(q) ||
        p.authors?.some((a) => a.toLowerCase().includes(q)) ||
        p.arxiv_id?.toLowerCase().includes(q)
    )
  }, [papers, searchQuery])

  if (!supabaseConfigured) {
    return (
      <div className="flex items-center justify-center rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-4 py-16">
        <p className="font-mono text-xs text-muted-foreground">
          Connect Supabase to browse collected papers.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-chart-1" />
          <span className="text-sm font-medium text-foreground">
            Papers Library
          </span>
          <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0">
            {filtered.length}{filtered.length !== papers.length ? ` / ${papers.length}` : ""}
          </Badge>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search papers..."
            className="h-8 rounded-md border border-border bg-secondary pl-8 pr-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-[200px] sm:w-[260px]"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="ml-2 font-mono text-xs text-muted-foreground">Loading papers...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-4 py-16 gap-2">
          <FileText className="h-8 w-8 text-muted-foreground/40" />
          <p className="font-mono text-xs text-muted-foreground">
            {searchQuery ? "No papers match your search." : "No papers collected yet. Run a research query to get started."}
          </p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {filtered.map((paper) => (
              <PaperCard key={paper.id} paper={paper} />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
