export type NodeType = "memory" | "paper" | "experiment" | "direction" | "query"
export type EdgeType = "semantic" | "implements" | "related" | "spawned"

export interface GraphNode {
  id: string
  label: string
  type: NodeType
  content?: string
  createdAt?: string
  metadata?: Record<string, unknown>
}

export interface GraphLink {
  source: string
  target: string
  type: EdgeType
  weight?: number
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

export interface SupamemoryDoc {
  id: string
  title: string | null
  summary: string | null
  createdAt: string
  metadata: unknown
  content?: string | null
}

export interface SupabasePaper {
  id: string
  task_id: string | null
  title: string
  abstract: string
  summary: string
  created_at: string
}

export interface SupabaseExperiment {
  id: string
  task_id: string | null
  paper_id: string | null
  status: string
  metrics: Record<string, unknown>
  created_at: string
}

export interface SupabaseDirection {
  id: string
  task_id: string | null
  title: string
  rationale: string
  feasibility_score: number
  novelty_score: number
  related_papers: string[]
  created_at: string
}

export interface SupabaseTask {
  id: string
  query: string
  status: string
  created_at: string
}

export interface MemorySearchResult {
  id: string
  memory?: string
  similarity: number
  updatedAt: string
  metadata: Record<string, unknown> | null
  context?: {
    parents?: Array<{ memory: string; relation: string }>
    children?: Array<{ memory: string; relation: string }>
  }
}

function truncate(text: string, max = 60): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + "…"
}

/**
 * Builds a unified graph from Supermemory documents and Supabase relational data.
 * Semantic edges are pre-computed by the API route and passed in directly.
 */
export function buildGraphData({
  documents,
  papers,
  experiments,
  directions,
  tasks,
  semanticEdges,
}: {
  documents: SupamemoryDoc[]
  papers: SupabasePaper[]
  experiments: SupabaseExperiment[]
  directions: SupabaseDirection[]
  tasks: SupabaseTask[]
  semanticEdges: GraphLink[]
}): GraphData {
  const nodes: GraphNode[] = []
  const links: GraphLink[] = [...semanticEdges]
  const nodeIds = new Set<string>()

  for (const doc of documents) {
    const id = `mem-${doc.id}`
    if (nodeIds.has(id)) continue
    nodeIds.add(id)
    nodes.push({
      id,
      label: truncate(doc.title || doc.summary || doc.content || "Memory"),
      type: "memory",
      content: doc.content || doc.summary || undefined,
      createdAt: doc.createdAt,
      metadata: typeof doc.metadata === "object" && doc.metadata !== null
        ? (doc.metadata as Record<string, unknown>)
        : undefined,
    })
  }

  for (const task of tasks) {
    const id = `task-${task.id}`
    if (nodeIds.has(id)) continue
    nodeIds.add(id)
    nodes.push({
      id,
      label: truncate(task.query),
      type: "query",
      content: task.query,
      createdAt: task.created_at,
      metadata: { status: task.status },
    })
  }

  // Group papers by task_id so we can add same-task paper–paper links later
  const papersByTask = new Map<string, string[]>()
  for (const paper of papers) {
    const id = `paper-${paper.id}`
    if (nodeIds.has(id)) continue
    nodeIds.add(id)
    nodes.push({
      id,
      label: truncate(paper.title),
      type: "paper",
      content: paper.abstract || paper.summary || undefined,
      createdAt: paper.created_at,
    })
    if (paper.task_id && nodeIds.has(`task-${paper.task_id}`)) {
      links.push({
        source: `task-${paper.task_id}`,
        target: id,
        type: "spawned",
      })
    }
    if (paper.task_id) {
      const list = papersByTask.get(paper.task_id) ?? []
      list.push(id)
      papersByTask.set(paper.task_id, list)
    }
  }
  // Connect papers that share the same task; cap so the graph stays readable
  const MAX_PAPER_LINKS_PER_TASK = 6
  const seenPaperPair = new Set<string>()
  for (const [, paperIds] of papersByTask) {
    if (paperIds.length < 2) continue
    const [hub, ...rest] = paperIds
    const toLink = rest.slice(0, MAX_PAPER_LINKS_PER_TASK - 1)
    for (const other of toLink) {
      const key = [hub, other].sort().join("--")
      if (seenPaperPair.has(key)) continue
      seenPaperPair.add(key)
      links.push({ source: hub, target: other, type: "related" })
    }
  }

  for (const exp of experiments) {
    const id = `exp-${exp.id}`
    if (nodeIds.has(id)) continue
    nodeIds.add(id)

    const parentPaper = papers.find((p) => p.id === exp.paper_id)
    nodes.push({
      id,
      label: truncate(parentPaper ? `Exp: ${parentPaper.title}` : `Experiment`),
      type: "experiment",
      createdAt: exp.created_at,
      metadata: { status: exp.status, ...exp.metrics },
    })
    if (exp.paper_id && nodeIds.has(`paper-${exp.paper_id}`)) {
      links.push({
        source: `paper-${exp.paper_id}`,
        target: id,
        type: "implements",
      })
    }
    if (exp.task_id && nodeIds.has(`task-${exp.task_id}`)) {
      links.push({
        source: `task-${exp.task_id}`,
        target: id,
        type: "spawned",
      })
    }
  }

  for (const dir of directions) {
    const id = `dir-${dir.id}`
    if (nodeIds.has(id)) continue
    nodeIds.add(id)
    nodes.push({
      id,
      label: truncate(dir.title),
      type: "direction",
      content: dir.rationale || undefined,
      createdAt: dir.created_at,
      metadata: {
        feasibility: dir.feasibility_score,
        novelty: dir.novelty_score,
      },
    })
    if (dir.task_id && nodeIds.has(`task-${dir.task_id}`)) {
      links.push({
        source: `task-${dir.task_id}`,
        target: id,
        type: "spawned",
      })
    }
    for (const paperId of dir.related_papers ?? []) {
      if (nodeIds.has(`paper-${paperId}`)) {
        links.push({
          source: id,
          target: `paper-${paperId}`,
          type: "related",
        })
      }
    }
  }

  return { nodes, links }
}
