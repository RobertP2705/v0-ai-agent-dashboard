import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { listDocuments, searchMemoriesWithScore } from "@/lib/supermemory"
import {
  buildGraphData,
  type GraphLink,
  type SupamemoryDoc,
  type SupabasePaper,
  type SupabaseExperiment,
  type SupabaseDirection,
  type SupabaseTask,
} from "@/lib/graph-utils"

const SEMANTIC_SIMILARITY_THRESHOLD = 0.55
const MAX_MEMORIES_FOR_SEMANTIC = 30
const MAX_DOCUMENTS = 200

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
    const supermemoryEnabled = !!process.env.SUPERMEMORY_API_KEY

    if (supermemoryEnabled) {
      try {
        const listResp = await listDocuments({
          containerTags: [user.id],
          limit: MAX_DOCUMENTS,
          includeContent: true,
        })
        documents = (listResp.memories ?? []).map((m) => ({
          id: m.id,
          title: m.title,
          summary: m.summary,
          createdAt: m.createdAt,
          metadata: m.metadata,
          content: (m as unknown as { content?: string | null }).content ?? undefined,
        }))

        const docsForSemantic = documents.slice(0, MAX_MEMORIES_FOR_SEMANTIC)
        const edgeSet = new Set<string>()

        const searchResults = await Promise.allSettled(
          docsForSemantic.map((doc) => {
            const query =
              doc.title || doc.summary || doc.content || "memory"
            return searchMemoriesWithScore({
              q: typeof query === "string" ? query : String(query),
              containerTag: user.id,
              limit: 5,
            })
          }),
        )

        for (let i = 0; i < searchResults.length; i++) {
          const result = searchResults[i]
          if (result.status !== "fulfilled") continue
          const sourceId = `mem-${docsForSemantic[i].id}`
          for (const match of result.value) {
            if (match.similarity < SEMANTIC_SIMILARITY_THRESHOLD) continue
            const targetId = `mem-${match.id}`
            if (sourceId === targetId) continue
            const key = [sourceId, targetId].sort().join("--")
            if (edgeSet.has(key)) continue
            edgeSet.add(key)
            semanticEdges.push({
              source: sourceId,
              target: targetId,
              type: "semantic",
              weight: match.similarity,
            })
          }
        }
      } catch (err) {
        console.warn("[graph] Supermemory fetch failed, continuing with Supabase data only:", err)
      }
    }

    const [papersRes, experimentsRes, directionsRes, tasksRes] =
      await Promise.all([
        supabase
          .from("papers")
          .select("id, task_id, title, abstract, summary, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("experiments")
          .select("id, task_id, paper_id, status, metrics, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("research_directions")
          .select(
            "id, task_id, title, rationale, feasibility_score, novelty_score, related_papers, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("tasks")
          .select("id, query, status, created_at")
          .order("created_at", { ascending: false })
          .limit(100),
      ])

    const graph = buildGraphData({
      documents,
      papers: (papersRes.data ?? []) as SupabasePaper[],
      experiments: (experimentsRes.data ?? []) as SupabaseExperiment[],
      directions: (directionsRes.data ?? []) as SupabaseDirection[],
      tasks: (tasksRes.data ?? []) as SupabaseTask[],
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
