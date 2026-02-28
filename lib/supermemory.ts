/**
 * Server-only Supermemory client. Use in API routes or server components.
 * Requires SUPERMEMORY_API_KEY in env (e.g. Vercel environment variables).
 */

import Supermemory from "supermemory"

function getClient() {
  const apiKey = process.env.SUPERMEMORY_API_KEY
  if (!apiKey) {
    throw new Error("SUPERMEMORY_API_KEY is not set")
  }
  return new Supermemory({ apiKey })
}

export interface AddMemoryOptions {
  content: string
  containerTags: string[]
  metadata?: Record<string, unknown>
  title?: string
}

export async function addMemory({ content, containerTags, metadata, title }: AddMemoryOptions) {
  const client = getClient()
  return client.add({
    content,
    containerTag: containerTags[0],
    metadata,
    ...(title ? { title } : {}),
  })
}

export interface SearchMemoryOptions {
  q: string
  containerTags: string[]
  limit?: number
}

export async function searchMemories({ q, containerTags, limit = 5 }: SearchMemoryOptions) {
  const client = getClient()
  const response = await client.search.documents({
    q,
    containerTags,
    limit,
  })
  return response.results ?? []
}
