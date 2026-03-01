# Best Use of Supermemory

## What We Built

An **AI research swarm** with persistent memory — a multi-agent system that remembers everything it has ever researched. Supermemory is the long-term memory layer that makes each research session smarter than the last.

## How We Use Supermemory

### 1. Retrieval-Augmented Generation (RAG) for Research Queries

Every time a user submits a research query, we search Supermemory for relevant past context and inject it into the agent pipeline:

```typescript
// app/api/swarm/stream/route.ts
if (process.env.SUPERMEMORY_API_KEY && query) {
  const results = await searchMemories({
    q: query,
    containerTags: [user.id],  // user-scoped memory
    limit: 10,
  })
  memoryContext = results
    .filter((r) => typeof r.content === "string")
    .map((r) => ({ content: r.content! }))
}

const payload = memoryContext.length > 0
  ? { ...basePayload, memory_context: memoryContext }
  : basePayload
```

The backend then augments the query with this context before triage and agent execution:

```python
# research_swarm/orchestrator.py
if memory_context:
    context_block = "\n\n".join(
        m["content"] for m in memory_context if isinstance(m.get("content"), str)
    )
    augmented_query = (
        f"## Relevant context from previous conversations:\n"
        f"{context_block}\n\n"
        f"## Current request:\n{query}"
    )
```

**Impact**: If a user previously researched "transformer attention mechanisms," and later asks about "flash attention optimizations," the system automatically surfaces the earlier findings — giving agents a running start instead of searching from scratch.

### 2. Automatic Memory Ingestion

Both user queries and completed research results are automatically saved to Supermemory, building a growing knowledge base without any user intervention:

```typescript
// components/dashboard/chat-interface.tsx

// Save user queries
if (m.type === "user") {
  fetch("/api/memory/add", {
    method: "POST",
    body: JSON.stringify({
      content: `User query: ${query}`,
      metadata: { type: "user_query", projectId },
      title: query.slice(0, 100),
    }),
  })
}

// Save completed research results
if (m.type === "task" && m.status === "completed") {
  const content = [m.query, summary].filter(Boolean).join("\n\n")
  fetch("/api/memory/add", {
    body: JSON.stringify({
      content,
      metadata: { type: "research_result", taskId: m.taskId, projectId },
      title: m.query?.slice(0, 100) || "Research",
    }),
  })
}
```

The server-side add endpoint scopes all memories to the authenticated user:

```typescript
// app/api/memory/add/route.ts
await addMemory({
  content,
  containerTags: [user.id],  // user-scoped isolation
  metadata,
  title,
})
```

### 3. Semantic Knowledge Graph

This is where Supermemory really shines. We build a **force-directed knowledge graph** that connects Supermemory documents with Supabase relational data (papers, experiments, research directions) using **semantic similarity edges**.

**Memory-to-memory edges**: For each Supermemory document, we search for semantically similar documents and create weighted edges:

```typescript
// app/api/graph/route.ts
async function computeSemanticEdges(documents, containerTag, edgeSet, deadline) {
  for (const batch of batches) {
    const searchResults = await Promise.allSettled(
      batch.map((doc) =>
        searchMemoriesWithScore({
          q: doc.title || doc.summary || doc.content || "memory",
          containerTag,
          limit: 6,
        })
      )
    )

    for (const match of results) {
      if (match.similarity < SEMANTIC_SIMILARITY_THRESHOLD) continue
      edges.push({
        source: sourceId,
        target: `mem-${match.id}`,
        type: "semantic",
        weight: match.similarity,
      })
    }
  }
}
```

**Cross-type edges**: We also connect Supabase entities (papers, research directions) to Supermemory documents via semantic search, creating a unified knowledge graph that spans both structured and unstructured data:

```typescript
async function computeCrossTypeEdges(papers, directions, containerTag, edgeSet, deadline) {
  // Search each paper title+abstract against Supermemory
  for (const p of papers) {
    const text = p.title + (p.abstract ? ` — ${p.abstract.slice(0, 200)}` : "")
    queries.push({ id: `paper-${p.id}`, text })
  }
  // Search each research direction against Supermemory
  for (const d of directions) {
    const text = d.title + (d.rationale ? ` — ${d.rationale.slice(0, 200)}` : "")
    queries.push({ id: `dir-${d.id}`, text })
  }
  // Batch semantic search to find connections
  ...
}
```

The result is a graph with five node types (memories, papers, experiments, directions, queries) and four edge types (semantic, implements, related, spawned) — visualized as an interactive force-directed graph in the dashboard.

### 4. User-Scoped Memory Isolation

Every Supermemory operation uses the authenticated Supabase user's ID as the `containerTag`, providing natural multi-tenancy:

- User A's research on "protein folding" never leaks into User B's queries
- Each user builds their own knowledge base over time
- The knowledge graph only shows the current user's memory network

### 5. Resilient Integration

Supermemory is feature-flagged and failure-tolerant throughout:

```typescript
// Status check — UI adapts when Supermemory is not configured
export async function GET() {
  const enabled = !!process.env.SUPERMEMORY_API_KEY
  return NextResponse.json({ enabled })
}
```

- If `SUPERMEMORY_API_KEY` is unset, memory features gracefully degrade — no errors, no broken UI
- Memory search failures during query streaming are non-fatal (caught and logged)
- Knowledge graph computation has per-call timeouts (8s) and a total deadline (25s) — partial results are served if Supermemory is slow
- Batch processing with `Promise.allSettled` ensures one failed search doesn't block others

### 6. Full-Corpus Pagination

For the knowledge graph, we paginate through the user's entire Supermemory corpus (up to 500 documents) rather than just fetching the first page:

```typescript
// lib/supermemory.ts
export async function listAllDocuments({ containerTags, maxDocuments = 500, pageSize = 100 }) {
  const allMemories = []
  let page = 1
  while (allMemories.length < maxDocuments) {
    const response = await client.documents.list({
      containerTags, limit: pageSize, page, includeContent: true,
      sort: "createdAt", order: "desc",
    })
    const memories = response.memories ?? []
    allMemories.push(...memories)
    if (memories.length < pageSize) break
    page++
  }
  return { memories: allMemories.slice(0, maxDocuments) }
}
```

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│  User submits research query                                    │
└──────────────────────┬──────────────────────────────────────────┘
                       │
          ┌────────────▼────────────┐
          │  Search Supermemory     │ ← Retrieve up to 10 relevant memories
          │  (user-scoped)         │
          └────────────┬────────────┘
                       │ memory_context
          ┌────────────▼────────────┐
          │  Augment query with     │ ← "## Relevant context from previous
          │  memory context         │    conversations: ..."
          └────────────┬────────────┘
                       │ augmented_query
          ┌────────────▼────────────┐
          │  Triage → Agents →      │ ← Agents benefit from prior research
          │  Merge                  │
          └────────────┬────────────┘
                       │ completed research
          ┌────────────▼────────────┐
          │  Auto-save to           │ ← Both query and results stored
          │  Supermemory            │
          └────────────┬────────────┘
                       │
          ┌────────────▼────────────┐
          │  Knowledge Graph        │ ← Semantic edges computed via
          │  (memories + papers +   │   searchMemoriesWithScore
          │   experiments +         │
          │   directions)           │
          └─────────────────────────┘
```

## Supermemory SDK Functions Used

| Function | Where | Purpose |
|----------|-------|---------|
| `client.add()` | `/api/memory/add` | Store user queries and research results |
| `client.search.documents()` | `/api/swarm/stream` | RAG: retrieve relevant context for new queries |
| `client.search.memories()` | `/api/graph` | Compute semantic similarity edges (with scores) |
| `client.documents.list()` | `/api/graph` | Paginate full corpus for knowledge graph nodes |

## The Feedback Loop

This is the core value proposition — Supermemory creates a **compounding knowledge flywheel**:

1. **Query** → User asks about "diffusion models for protein design"
2. **Retrieve** → Supermemory returns context from past research on "protein folding" and "generative models"
3. **Research** → Agents produce richer results because they have prior context
4. **Store** → The new findings are saved back to Supermemory
5. **Graph** → The knowledge graph updates with new nodes and semantic edges
6. **Repeat** → Next query starts with an even richer context

Each research session makes the next one better. The system doesn't just answer questions — it accumulates institutional knowledge.
