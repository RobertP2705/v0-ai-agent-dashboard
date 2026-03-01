"use client"

import { useEffect, useState, useMemo, useCallback, useRef } from "react"
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

const PAGE_SIZE = 50

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
    <Card className="border-border/80 bg-card/60 backdrop-blur-sm transition-all duration-200 hover:bg-card/80 hover:shadow-sm">
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
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const sentinelRef = useRef<HTMLDivElement>(null)

  const loadPage = useCallback(async (pageNum: number, append: boolean) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const result = await fetchPapers(pageNum, PAGE_SIZE)
      setPapers((prev) => append ? [...prev, ...result.data] : result.data)
      setTotal(result.total)
      setPage(pageNum)
    } catch {
      // keep existing
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false)
      return
    }
    loadPage(0, false)
  }, [loadPage])

  const hasMore = papers.length < total

  useEffect(() => {
    if (!hasMore || loadingMore || loading) return
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingMore) {
          loadPage(page + 1, true)
        }
      },
      { rootMargin: "200px" },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, loading, page, loadPage])

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

  const countLabel = searchQuery
    ? `${filtered.length} / ${total}`
    : `${papers.length} / ${total}`

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-chart-1" />
          <span className="text-sm font-medium text-foreground">
            Papers Library
          </span>
          <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0">
            {countLabel}
          </Badge>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search papers..."
            className="h-8 rounded-lg border border-border/80 bg-secondary/50 pl-8 pr-3 font-mono text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all w-[200px] sm:w-[260px]"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="ml-2 font-mono text-xs text-muted-foreground">Loading papers...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/60 bg-card/30 px-4 py-16">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/50">
            <FileText className="h-6 w-6 text-muted-foreground/30" />
          </div>
          <p className="font-mono text-xs text-muted-foreground/70">
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
          {!searchQuery && (
            <div ref={sentinelRef} className="flex items-center justify-center py-4">
              {loadingMore && (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground">Loading more...</span>
                </>
              )}
            </div>
          )}
        </ScrollArea>
      )}
    </div>
  )
}
