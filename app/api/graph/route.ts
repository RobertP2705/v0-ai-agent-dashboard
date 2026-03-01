import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { listAllDocuments, searchMemoriesWithScore } from "@/lib/supermemory"
import {
  buildGraphData,
  type GraphLink,
  type SupamemoryDoc,
  type SupabasePaper,
  type SupabaseExperiment,
  type SupabaseDirection,
  type SupabaseTask,
} from "@/lib/graph-utils"

// Lower threshold so more semantic edges are created (was 0.45; many valid links were dropped)
const SEMANTIC_SIMILARITY_THRESHOLD = 0.32
const MAX_DOCUMENTS = 500
const SEMANTIC_BATCH_SIZE = 8
const SUPERMEMORY_CALL_TIMEOUT_MS = 8_000
const SUPERMEMORY_TOTAL_TIMEOUT_MS = 25_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${label} exceeded ${ms}ms`)), ms),
    ),
  ])
}

async function computeSemanticEdges(
  documents: SupamemoryDoc[],
  containerTag: string,
  edgeSet: Set<string>,
  deadline: number,
): Promise<GraphLink[]> {
  const edges: GraphLink[] = []

  for (let offset = 0; offset < documents.length; offset += SEMANTIC_BATCH_SIZE) {
    if (Date.now() > deadline) {
      console.warn(`[graph] Semantic edge computation hit deadline at batch offset ${offset}/${documents.length}`)
      break
    }
    const batch = documents.slice(offset, offset + SEMANTIC_BATCH_SIZE)
    const searchResults = await Promise.allSettled(
      batch.map((doc) => {
        const query = doc.title || doc.summary || doc.content || "memory"
        return withTimeout(
          searchMemoriesWithScore({
            q: typeof query === "string" ? query : String(query),
            containerTag,
            limit: 10,
          }),
          SUPERMEMORY_CALL_TIMEOUT_MS,
          "searchMemoriesWithScore",
        )
      }),
    )

    for (let i = 0; i < searchResults.length; i++) {
      const result = searchResults[i]
      if (result.status !== "fulfilled") continue
      const sourceId = `mem-${batch[i].id}`
      for (const match of result.value) {
        if (match.similarity < SEMANTIC_SIMILARITY_THRESHOLD) continue
        // Nodes are keyed by document id (from documents.list); search.memories returns memory ids.
        // Use linked document id when present so the edge targets an existing node.
        const docId = (match as { documents?: Array<{ id: string }> }).documents?.[0]?.id
        const targetId = docId ? `mem-${docId}` : `mem-${match.id}`
        if (sourceId === targetId) continue
        const key = [sourceId, targetId].sort().join("--")
        if (edgeSet.has(key)) continue
        edgeSet.add(key)
        edges.push({
          source: sourceId,
          target: targetId,
          type: "semantic",
          weight: match.similarity,
        })
      }
    }
  }

  return edges
}

async function computeCrossTypeEdges(
  papers: SupabasePaper[],
  directions: SupabaseDirection[],
  containerTag: string,
  edgeSet: Set<string>,
  deadline: number,
): Promise<GraphLink[]> {
  const edges: GraphLink[] = []

  const queries: { id: string; text: string }[] = []
  for (const p of papers) {
    const text = p.title + (p.abstract ? ` — ${p.abstract.slice(0, 200)}` : "")
    queries.push({ id: `paper-${p.id}`, text })
  }
  for (const d of directions) {
    const text = d.title + (d.rationale ? ` — ${d.rationale.slice(0, 200)}` : "")
    queries.push({ id: `dir-${d.id}`, text })
  }

  for (let offset = 0; offset < queries.length; offset += SEMANTIC_BATCH_SIZE) {
    if (Date.now() > deadline) {
      console.warn(`[graph] Cross-type edge computation hit deadline at batch offset ${offset}/${queries.length}`)
      break
    }
    const batch = queries.slice(offset, offset + SEMANTIC_BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map((item) =>
        withTimeout(
          searchMemoriesWithScore({
            q: item.text.slice(0, 300),
            containerTag,
            limit: 6,
          }),
          SUPERMEMORY_CALL_TIMEOUT_MS,
          "crossTypeSearch",
        ),
      ),
    )
    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      if (result.status !== "fulfilled") continue
      const sourceId = batch[i].id
      for (const match of result.value) {
        if (match.similarity < SEMANTIC_SIMILARITY_THRESHOLD) continue
        const docId = (match as { documents?: Array<{ id: string }> }).documents?.[0]?.id
        const targetId = docId ? `mem-${docId}` : `mem-${match.id}`
        const key = [sourceId, targetId].sort().join("--")
        if (edgeSet.has(key)) continue
        edgeSet.add(key)
        edges.push({
          source: sourceId,
          target: targetId,
          type: "semantic",
          weight: match.similarity,
        })
      }
    }
  }

  return edges
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let documents: SupamemoryDoc[] = []
    let semanticEdges: GraphLink[] = []
    const edgeSet = new Set<string>()
    const supermemoryEnabled = !!process.env.SUPERMEMORY_API_KEY
    const deadline = Date.now() + SUPERMEMORY_TOTAL_TIMEOUT_MS

    if (supermemoryEnabled) {
      try {
        const listResp = await withTimeout(
          listAllDocuments({
            containerTags: [user.id],
            maxDocuments: MAX_DOCUMENTS,
            pageSize: 100,
            includeContent: true,
          }),
          SUPERMEMORY_CALL_TIMEOUT_MS * 3,
          "listAllDocuments",
        )
        documents = (listResp.memories ?? []).map((m) => ({
          id: m.id,
          title: m.title,
          summary: m.summary,
          createdAt: m.createdAt,
          metadata: m.metadata,
          content: (m as unknown as { content?: string | null }).content ?? undefined,
        }))

        if (Date.now() < deadline) {
          const memEdges = await computeSemanticEdges(documents, user.id, edgeSet, deadline)
          semanticEdges.push(...memEdges)
        } else {
          console.warn("[graph] Skipping semantic edges — deadline reached after document fetch")
        }
      } catch (err) {
        console.warn("[graph] Supermemory fetch failed, continuing with Supabase data only:", err)
      }
    }

    // Scope experiments & directions to the current user via ownership chain:
    // user → teams (user_id) → tasks (team_id) → experiments/directions (task_id)
    const teamsRes = await supabase
      .from("teams")
      .select("id")
      .eq("user_id", user.id)
    const teamIds = (teamsRes.data ?? []).map((t: { id: string }) => t.id)

    let tasks: SupabaseTask[] = []
    let experiments: SupabaseExperiment[] = []
    let directions: SupabaseDirection[] = []

    // Papers are a shared knowledge base — fetch all regardless of ownership
    const papersRes = await supabase
      .from("papers")
      .select("id, task_id, title, abstract, summary, created_at")
      .order("created_at", { ascending: false })
      .limit(500)
    const papers: SupabasePaper[] = (papersRes.data ?? []) as SupabasePaper[]

    if (teamIds.length > 0) {
      const tasksRes = await supabase
        .from("tasks")
        .select("id, query, status, created_at")
        .in("team_id", teamIds)
        .order("created_at", { ascending: false })
        .limit(1000)
      tasks = (tasksRes.data ?? []) as SupabaseTask[]

      const taskIds = tasks.map((t) => t.id)

      if (taskIds.length > 0) {
        const [experimentsRes, directionsRes] = await Promise.all([
          supabase
            .from("experiments")
            .select("id, task_id, paper_id, status, metrics, created_at")
            .in("task_id", taskIds)
            .order("created_at", { ascending: false })
            .limit(500),
          supabase
            .from("research_directions")
            .select(
              "id, task_id, title, rationale, feasibility_score, novelty_score, related_papers, created_at",
            )
            .in("task_id", taskIds)
            .order("created_at", { ascending: false })
            .limit(500),
        ])
        experiments = (experimentsRes.data ?? []) as SupabaseExperiment[]
        directions = (directionsRes.data ?? []) as SupabaseDirection[]
      }
    }

    // Cross-type semantic edges: papers & directions → memories
    if (supermemoryEnabled && documents.length > 0 && Date.now() < deadline) {
      try {
        const crossEdges = await computeCrossTypeEdges(
          papers,
          directions,
          user.id,
          edgeSet,
          deadline,
        )
        semanticEdges.push(...crossEdges)
      } catch (err) {
        console.warn("[graph] Cross-type semantic search failed:", err)
      }
    }

    const graph = buildGraphData({
      documents,
      papers,
      experiments,
      directions,
      tasks,
      semanticEdges,
    })

    return NextResponse.json(graph)
  } catch (err) {
    console.error("[graph]", err)
    return NextResponse.json(
      { error: "Failed to build knowledge graph" },
      { status: 500 },
    )
  }
}
