"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import dynamic from "next/dynamic"
import { cn } from "@/lib/utils"
import type { GraphData, GraphNode, GraphLink, NodeType, EdgeType } from "@/lib/graph-utils"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Search,
  RefreshCw,
  X,
  Brain,
  FileText,
  FlaskConical,
  Compass,
  MessageSquare,
  Loader2,
  Network,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react"
import type { ForceGraphMethods } from "react-force-graph-2d"

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
})

const NODE_COLORS: Record<NodeType, string> = {
  memory: "#34d399",
  paper: "#60a5fa",
  experiment: "#fbbf24",
  direction: "#f87171",
  query: "#a78bfa",
}

const EDGE_COLORS: Record<EdgeType, string> = {
  semantic: "rgba(52,211,153,0.15)",
  implements: "rgba(251,191,36,0.2)",
  related: "rgba(248,113,113,0.2)",
  spawned: "rgba(167,139,250,0.15)",
}

const NODE_ICONS: Record<NodeType, typeof Brain> = {
  memory: Brain,
  paper: FileText,
  experiment: FlaskConical,
  direction: Compass,
  query: MessageSquare,
}

const NODE_LABELS: Record<NodeType, string> = {
  memory: "Memories",
  paper: "Papers",
  experiment: "Experiments",
  direction: "Directions",
  query: "Queries",
}

const ALL_NODE_TYPES: NodeType[] = ["memory", "paper", "experiment", "direction", "query"]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FGMethods = ForceGraphMethods<any, any>

interface KnowledgeGraphViewProps {
  projectId?: string
}

const FETCH_TIMEOUT_MS = 35_000

const LOADING_PHASES = [
  { after: 0, message: "Connecting to API..." },
  { after: 2, message: "Authenticating and fetching memories..." },
  { after: 5, message: "Querying Supermemory for stored documents..." },
  { after: 10, message: "Computing semantic relationships between nodes..." },
  { after: 18, message: "Building cross-type edges (papers, directions)..." },
  { after: 25, message: "Assembling final graph — almost there..." },
]

function getLoadingMessage(elapsedSec: number): string {
  let msg = LOADING_PHASES[0].message
  for (const phase of LOADING_PHASES) {
    if (elapsedSec >= phase.after) msg = phase.message
  }
  return msg
}

export function KnowledgeGraphView({ projectId }: KnowledgeGraphViewProps = {}) {
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTypes, setActiveTypes] = useState<Set<NodeType>>(new Set(ALL_NODE_TYPES))
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<FGMethods | undefined>(undefined)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const hasAutoFit = useRef(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [loadingElapsed, setLoadingElapsed] = useState(0)
  const loadingStartRef = useRef<number>(0)

  const fetchGraph = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    setLoading(true)
    setError(null)
    setLoadingElapsed(0)
    loadingStartRef.current = Date.now()

    try {
      const res = await fetch("/api/graph", { signal: controller.signal })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data: GraphData = await res.json()
      setGraphData(data)
      hasAutoFit.current = false
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setError("Request timed out — the graph API took too long. Try again or check Supermemory connectivity.")
      } else {
        setError(err instanceof Error ? err.message : "Failed to load graph")
      }
    } finally {
      clearTimeout(timeout)
      setLoading(false)
      abortRef.current = null
    }
  }, [])

  useEffect(() => {
    fetchGraph()
    return () => { abortRef.current?.abort() }
  }, [fetchGraph])

  useEffect(() => {
    if (!loading) return
    const interval = setInterval(() => {
      setLoadingElapsed(Math.floor((Date.now() - loadingStartRef.current) / 1000))
    }, 500)
    return () => clearInterval(interval)
  }, [loading])

  // Measure the graph wrapper so the canvas matches the card; fallback + delayed measure so graph always renders
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      const w = Math.floor(rect.width)
      const h = Math.floor(rect.height)
      if (w > 0 && h > 0) {
        setDimensions((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }))
      }
    }
    measure()
    const raf = requestAnimationFrame(measure)
    const late = setTimeout(measure, 150)
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(late)
      observer.disconnect()
    }
  }, [])

  // Auto-fit to view once the simulation settles so the whole graph is visible
  useEffect(() => {
    if (!graphData || graphData.nodes.length === 0 || hasAutoFit.current) return
    const timer = setTimeout(() => {
      if (graphRef.current) {
        graphRef.current.zoomToFit(500, 80)
        hasAutoFit.current = true
      }
    }, 1500)
    return () => clearTimeout(timer)
  }, [graphData])

  const filteredData = useMemo(() => {
    if (!graphData) return { nodes: [], links: [] }

    const lowerQuery = searchQuery.toLowerCase()
    const visibleNodes = graphData.nodes.filter((n) => {
      if (!activeTypes.has(n.type)) return false
      if (lowerQuery && !n.label.toLowerCase().includes(lowerQuery)) return false
      return true
    })
    const visibleIds = new Set(visibleNodes.map((n) => n.id))
    const visibleLinks = graphData.links.filter(
      (l) => visibleIds.has(l.source as string) && visibleIds.has(l.target as string),
    )
    return { nodes: visibleNodes, links: visibleLinks }
  }, [graphData, searchQuery, activeTypes])

  const degreeMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const link of filteredData.links) {
      const s = typeof link.source === "string" ? link.source : (link.source as GraphNode).id
      const t = typeof link.target === "string" ? link.target : (link.target as GraphNode).id
      m.set(s, (m.get(s) ?? 0) + 1)
      m.set(t, (m.get(t) ?? 0) + 1)
    }
    return m
  }, [filteredData])

  const connectedNodes = useMemo(() => {
    if (!selectedNode || !graphData) return []
    const connected: GraphNode[] = []
    for (const link of graphData.links) {
      const s = typeof link.source === "string" ? link.source : (link.source as GraphNode).id
      const t = typeof link.target === "string" ? link.target : (link.target as GraphNode).id
      if (s === selectedNode.id) {
        const node = graphData.nodes.find((n) => n.id === t)
        if (node) connected.push(node)
      } else if (t === selectedNode.id) {
        const node = graphData.nodes.find((n) => n.id === s)
        if (node) connected.push(node)
      }
    }
    return connected
  }, [selectedNode, graphData])

  const toggleType = (type: NodeType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      setSelectedNode((prev) => (prev?.id === node.id ? null : node))
      if (graphRef.current) {
        const n = node as GraphNode & { x?: number; y?: number }
        graphRef.current.centerAt(n.x, n.y, 500)
        graphRef.current.zoom(3, 500)
      }
    },
    [],
  )

  const handleZoomIn = () => {
    if (graphRef.current) {
      const current = graphRef.current.zoom()
      graphRef.current.zoom(current * 1.5, 300)
    }
  }

  const handleZoomOut = () => {
    if (graphRef.current) {
      const current = graphRef.current.zoom()
      graphRef.current.zoom(current / 1.5, 300)
    }
  }

  const handleFitView = () => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(500, 80)
    }
  }

  // Labels only when zoomed in or node is selected/hovered — reduces overlap and clutter
  const LABEL_VISIBLE_SCALE = 2.5
  const nodeCanvasObject = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const gn = node as GraphNode & { x: number; y: number }
      const degree = degreeMap.get(gn.id) ?? 0
      const baseSize = 3
      const size = baseSize + Math.min(degree * 0.8, 8)
      const isSelected = selectedNode?.id === gn.id
      const isHovered = hoveredNode?.id === gn.id
      const isSearchMatch =
        searchQuery && gn.label.toLowerCase().includes(searchQuery.toLowerCase())
      const showLabel = globalScale > LABEL_VISIBLE_SCALE || isSelected || isHovered || isSearchMatch

      ctx.beginPath()
      ctx.arc(gn.x, gn.y, size, 0, 2 * Math.PI)
      ctx.fillStyle = NODE_COLORS[gn.type] || "#888"
      ctx.globalAlpha = isSelected || isHovered || isSearchMatch ? 1 : 0.8
      ctx.fill()

      if (isSelected || isHovered) {
        ctx.strokeStyle = "#fff"
        ctx.lineWidth = 2 / globalScale
        ctx.stroke()
      }
      if (isSearchMatch && !isSelected && !isHovered) {
        ctx.strokeStyle = NODE_COLORS[gn.type]
        ctx.lineWidth = 2 / globalScale
        ctx.stroke()
      }

      ctx.globalAlpha = 1

      if (showLabel) {
        const label = gn.label
        const fontSize = Math.max(11 / globalScale, 2)
        ctx.font = `${fontSize}px sans-serif`
        ctx.textAlign = "center"
        ctx.textBaseline = "top"
        ctx.fillStyle = "rgba(255,255,255,0.95)"
        ctx.fillText(label, gn.x, gn.y + size + 2)
      }
    },
    [degreeMap, selectedNode, hoveredNode, searchQuery],
  )

  const nodePointerAreaPaint = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (node: any, color: string, ctx: CanvasRenderingContext2D) => {
      const gn = node as GraphNode & { x: number; y: number }
      const degree = degreeMap.get(gn.id) ?? 0
      const size = 3 + Math.min(degree * 0.8, 8) + 2
      ctx.beginPath()
      ctx.arc(gn.x, gn.y, size, 0, 2 * Math.PI)
      ctx.fillStyle = color
      ctx.fill()
    },
    [degreeMap],
  )

  const typeCounts = useMemo(() => {
    if (!graphData) return {} as Record<NodeType, number>
    const counts: Record<string, number> = {}
    for (const n of graphData.nodes) {
      counts[n.type] = (counts[n.type] ?? 0) + 1
    }
    return counts as Record<NodeType, number>
  }, [graphData])

  if (loading) {
    const message = getLoadingMessage(loadingElapsed)
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-xs text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">Building knowledge graph</p>
            <p className="text-xs text-muted-foreground animate-pulse">{message}</p>
            {loadingElapsed > 0 && (
              <p className="font-mono text-[10px] text-muted-foreground/60 tabular-nums">
                {loadingElapsed}s elapsed
              </p>
            )}
          </div>
          {loadingElapsed >= 10 && (
            <button
              onClick={() => abortRef.current?.abort()}
              className="rounded-md border border-border bg-secondary px-3 py-1.5 text-xs text-secondary-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <Network className="h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
          <button
            onClick={fetchGraph}
            className="rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <Network className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No data yet. Start researching to build your knowledge graph.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card/80 px-3 py-2">
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 pl-8 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {ALL_NODE_TYPES.map((type) => {
            const Icon = NODE_ICONS[type]
            const active = activeTypes.has(type)
            const count = typeCounts[type] ?? 0
            return (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all",
                  active
                    ? "border-transparent text-background"
                    : "border-border text-muted-foreground opacity-50 hover:opacity-75",
                )}
                style={
                  active
                    ? { backgroundColor: NODE_COLORS[type] }
                    : undefined
                }
              >
                <Icon className="h-3 w-3" />
                <span className="hidden sm:inline">{NODE_LABELS[type]}</span>
                <span className="font-mono">{count}</span>
              </button>
            )
          })}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={handleZoomIn}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleZoomOut}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleFitView}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Fit to view"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={fetchGraph}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-4 px-1">
        <span className="font-mono text-[10px] text-muted-foreground">
          {filteredData.nodes.length} nodes
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {filteredData.links.length} connections
        </span>
        <span className="text-[10px] text-muted-foreground/80">
          Zoom in or hover to see labels
        </span>
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            Clear filter <X className="h-2.5 w-2.5" />
          </button>
        )}
      </div>

      {/* Graph + Detail Panel: min-h ensures the wrapper gets a real size so the graph doesn't clip */}
      <div
        ref={wrapperRef}
        className="relative flex min-h-[420px] min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted/20"
      >
        <div ref={containerRef} className="absolute inset-0 size-full">
          {filteredData.nodes.length > 0 && (() => {
            const w = dimensions.width || 800
            const h = dimensions.height || 600
            return (
            <ForceGraph2D
              ref={graphRef as React.MutableRefObject<FGMethods | undefined>}
              width={selectedNode ? w * 0.65 : w}
              height={h}
              graphData={filteredData}
              nodeId="id"
              nodeCanvasObject={nodeCanvasObject}
              nodePointerAreaPaint={nodePointerAreaPaint}
              onNodeClick={(node) => handleNodeClick(node as GraphNode)}
              onNodeHover={(node) => setHoveredNode((node as GraphNode) || null)}
              onBackgroundClick={() => setSelectedNode(null)}
              linkColor={(link: unknown) => EDGE_COLORS[(link as GraphLink).type] || "rgba(255,255,255,0.08)"}
              linkWidth={(link: unknown) => {
                const gl = link as GraphLink
                return gl.type === "semantic" ? Math.min((gl.weight ?? 0.5) * 1.2, 1.2) : 0.8
              }}
              linkDirectionalParticles={0}
              cooldownTicks={150}
              d3AlphaDecay={0.02}
              d3VelocityDecay={0.3}
              backgroundColor="transparent"
              enableNodeDrag={true}
              enableZoomInteraction={true}
            />
            )
          })()}
        </div>

        {/* Detail Panel */}
        {selectedNode && (
          <div className="absolute right-0 top-0 z-10 flex h-full w-[35%] min-w-[240px] max-w-[360px] flex-col border-l border-border bg-card/95 shadow-lg backdrop-blur-sm">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                {(() => {
                  const Icon = NODE_ICONS[selectedNode.type]
                  return <Icon className="h-4 w-4 shrink-0" style={{ color: NODE_COLORS[selectedNode.type] }} />
                })()}
                <span className="truncate text-xs font-semibold text-foreground">Node Details</span>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-3 p-3">
                <div className="min-w-0">
                  <Badge
                    variant="outline"
                    className="mb-1.5 text-[10px]"
                    style={{
                      borderColor: NODE_COLORS[selectedNode.type],
                      color: NODE_COLORS[selectedNode.type],
                    }}
                  >
                    {selectedNode.type}
                  </Badge>
                  <h3 className="line-clamp-2 break-words text-sm font-semibold text-foreground leading-snug">
                    {selectedNode.label}
                  </h3>
                  {selectedNode.createdAt && (
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      {new Date(selectedNode.createdAt).toLocaleDateString()}
                    </p>
                  )}
                </div>

                {selectedNode.content && (
                  <div className="min-w-0">
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Content
                    </p>
                    <p className="line-clamp-6 break-words whitespace-pre-wrap text-xs leading-relaxed text-foreground/80">
                      {selectedNode.content.length > 800
                        ? selectedNode.content.slice(0, 800) + "..."
                        : selectedNode.content}
                    </p>
                  </div>
                )}

                {selectedNode.metadata && Object.keys(selectedNode.metadata).length > 0 && (
                  <div className="min-w-0">
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Metadata
                    </p>
                    <div className="space-y-0.5">
                      {Object.entries(selectedNode.metadata).map(([key, val]) => (
                        <div key={key} className="flex min-w-0 items-center gap-2">
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                            {key}:
                          </span>
                          <span className="min-w-0 truncate font-mono text-[10px] text-foreground/80">
                            {String(val)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {connectedNodes.length > 0 && (
                  <div className="min-w-0">
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Connected ({connectedNodes.length})
                    </p>
                    <div className="space-y-1">
                      {connectedNodes.map((cn) => {
                        const Icon = NODE_ICONS[cn.type]
                        return (
                          <button
                            key={cn.id}
                            onClick={() => handleNodeClick(cn)}
                            className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-secondary/50"
                          >
                            <Icon
                              className="h-3 w-3 shrink-0"
                              style={{ color: NODE_COLORS[cn.type] }}
                            />
                            <span className="min-w-0 truncate text-[11px] text-foreground/80">
                              {cn.label}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  )
}
