import { createClient as createBrowserClient } from "@/lib/supabase/client"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""

export const supabaseConfigured = !!(supabaseUrl && supabaseAnonKey)

// Use the SSR-aware browser client so RLS policies work with the logged-in user's session
function getSupabase() {
  return createBrowserClient()
}

// ── Types matching the Supabase schema ──────────────────────────────────

export interface Team {
  id: string
  name: string
  description: string
  created_at: string
  user_id?: string
  team_agents?: TeamAgent[]
}

export interface TeamAgent {
  id: string
  team_id: string
  agent_type: string
  config: Record<string, unknown>
  enabled: boolean
}

export interface ResearchProject {
  id: string
  user_id: string
  name: string
  description: string
  status: "setup" | "active" | "paused" | "completed"
  team_id: string | null
  created_at: string
  updated_at: string
  team?: Team | null
}

export interface Paper {
  id: string
  task_id: string | null
  arxiv_id: string
  title: string
  authors: string[]
  abstract: string
  summary: string
  pdf_url: string
  created_at: string
}

export interface Experiment {
  id: string
  task_id: string | null
  paper_id: string | null
  code: string
  wandb_run_url: string
  github_repo: string
  github_commit: string
  status: string
  metrics: Record<string, unknown>
  created_at: string
}

export interface ResearchDirection {
  id: string
  task_id: string | null
  title: string
  rationale: string
  feasibility_score: number
  novelty_score: number
  related_papers: string[]
  created_at: string
}

// ── Team CRUD (direct Supabase from client) ─────────────────────────────

export async function fetchTeams(): Promise<Team[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("teams")
    .select("*, team_agents(*)")
    .order("created_at", { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createTeam(name: string, description = ""): Promise<Team> {
  const supabase = getSupabase()
  // Get the current user's ID to associate the team with them
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data, error } = await supabase
    .from("teams")
    .insert({ name, description, user_id: user.id })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTeam(id: string, updates: Partial<Pick<Team, "name" | "description">>): Promise<Team> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("teams")
    .update(updates)
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTeam(id: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from("teams").delete().eq("id", id)
  if (error) throw error
}

export async function addAgentToTeam(teamId: string, agentType: string): Promise<TeamAgent> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("team_agents")
    .insert({ team_id: teamId, agent_type: agentType, config: {}, enabled: true })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function removeAgentFromTeam(agentRowId: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from("team_agents").delete().eq("id", agentRowId)
  if (error) throw error
}

export async function toggleAgentInTeam(agentRowId: string, enabled: boolean): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from("team_agents")
    .update({ enabled })
    .eq("id", agentRowId)
  if (error) throw error
}

// ── Chat history (per-user per-project, stored in Supabase) ──────────────

export async function loadChatHistory(projectId: string): Promise<unknown[] | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("chat_history")
    .select("messages")
    .eq("project_id", projectId)
    .maybeSingle()
  if (error) throw error
  return (data?.messages as unknown[]) ?? null
}

export async function saveChatHistory(userId: string, projectId: string, messages: unknown[]): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from("chat_history")
    .upsert({
      user_id: userId,
      project_id: projectId,
      messages,
      updated_at: new Date().toISOString(),
    })
  if (error) throw error
}

export async function clearChatHistory(userId: string, projectId: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from("chat_history")
    .delete()
    .eq("user_id", userId)
    .eq("project_id", projectId)
  if (error) throw error
}

// ── Real metrics queries ─────────────────────────────────────────────────

export interface TaskRow {
  id: string
  query: string
  status: string
  assigned_agents: string[]
  merged_answer: string
  total_usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  created_at: string
  team_id: string | null
}

export interface TaskEventRow {
  id: string
  task_id: string
  agent_type: string
  event_type: string
  message: string
  meta: Record<string, unknown>
  created_at: string
}

export async function fetchTasks(limit = 50): Promise<TaskRow[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function fetchTaskEvents(taskId: string): Promise<TaskEventRow[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("task_events")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function fetchAllEvents(limit = 200): Promise<TaskEventRow[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("task_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).reverse()
}

export async function fetchPapers(limit = 50): Promise<Paper[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("papers")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function fetchExperiments(limit = 50): Promise<Experiment[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("experiments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function fetchDirections(limit = 50): Promise<ResearchDirection[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("research_directions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export interface DashboardStats {
  totalTasks: number
  completedTasks: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  totalPapers: number
  totalExperiments: number
  totalDirections: number
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const supabase = getSupabase()
  const [tasks, papers, experiments, directions] = await Promise.all([
    supabase.from("tasks").select("status, total_usage"),
    supabase.from("papers").select("id", { count: "exact", head: true }),
    supabase.from("experiments").select("id", { count: "exact", head: true }),
    supabase.from("research_directions").select("id", { count: "exact", head: true }),
  ])

  let totalTokens = 0
  let promptTokens = 0
  let completionTokens = 0
  let completedTasks = 0
  const taskRows = tasks.data ?? []

  for (const t of taskRows) {
    const u = t.total_usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null
    if (u) {
      totalTokens += u.total_tokens ?? 0
      promptTokens += u.prompt_tokens ?? 0
      completionTokens += u.completion_tokens ?? 0
    }
    if (t.status === "completed") completedTasks++
  }

  return {
    totalTasks: taskRows.length,
    completedTasks,
    totalTokens,
    promptTokens,
    completionTokens,
    totalPapers: papers.count ?? 0,
    totalExperiments: experiments.count ?? 0,
    totalDirections: directions.count ?? 0,
  }
}

// ── Project CRUD ─────────────────────────────────────────────────────────

export async function fetchProjects(): Promise<ResearchProject[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("research_projects")
    .select("*, team:teams(id, name, description)")
    .order("updated_at", { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchProject(id: string): Promise<ResearchProject> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("research_projects")
    .select("*, team:teams(id, name, description)")
    .eq("id", id)
    .single()
  if (error) throw error
  return data
}

export async function createProject(
  name: string,
  description = "",
  teamId?: string,
): Promise<ResearchProject> {
  const supabase = getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data, error } = await supabase
    .from("research_projects")
    .insert({
      name,
      description,
      user_id: user.id,
      team_id: teamId ?? null,
      status: "active",
    })
    .select("*, team:teams(id, name, description)")
    .single()
  if (error) throw error
  return data
}

export async function updateProject(
  id: string,
  updates: Partial<Pick<ResearchProject, "name" | "description" | "status" | "team_id">>,
): Promise<ResearchProject> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("research_projects")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*, team:teams(id, name, description)")
    .single()
  if (error) throw error
  return data
}

export async function deleteProject(id: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from("research_projects").delete().eq("id", id)
  if (error) throw error
}

export async function fetchDashboardStatsForProject(projectId: string): Promise<DashboardStats> {
  const project = await fetchProject(projectId)
  if (!project.team_id) {
    return { totalTasks: 0, completedTasks: 0, totalTokens: 0, promptTokens: 0, completionTokens: 0, totalPapers: 0, totalExperiments: 0, totalDirections: 0 }
  }

  const supabase = getSupabase()
  const { data: taskRows, error: taskErr } = await supabase
    .from("tasks")
    .select("id, status, total_usage")
    .eq("team_id", project.team_id)
  if (taskErr) throw taskErr

  const rows = taskRows ?? []
  const taskIds = rows.map((t) => t.id)

  let totalTokens = 0
  let promptTokens = 0
  let completionTokens = 0
  let completedTasks = 0
  for (const t of rows) {
    const u = t.total_usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null
    if (u) {
      totalTokens += u.total_tokens ?? 0
      promptTokens += u.prompt_tokens ?? 0
      completionTokens += u.completion_tokens ?? 0
    }
    if (t.status === "completed") completedTasks++
  }

  if (taskIds.length === 0) {
    return { totalTasks: 0, completedTasks: 0, totalTokens, promptTokens, completionTokens, totalPapers: 0, totalExperiments: 0, totalDirections: 0 }
  }

  const [papers, experiments, directions] = await Promise.all([
    supabase.from("papers").select("id", { count: "exact", head: true }).in("task_id", taskIds),
    supabase.from("experiments").select("id", { count: "exact", head: true }).in("task_id", taskIds),
    supabase.from("research_directions").select("id", { count: "exact", head: true }).in("task_id", taskIds),
  ])

  return {
    totalTasks: rows.length,
    completedTasks,
    totalTokens,
    promptTokens,
    completionTokens,
    totalPapers: papers.count ?? 0,
    totalExperiments: experiments.count ?? 0,
    totalDirections: directions.count ?? 0,
  }
}

// ── Scoped queries (filter by project_id via its team_id → tasks.team_id) ──

export async function fetchTasksForProject(projectId: string, limit = 50): Promise<TaskRow[]> {
  const project = await fetchProject(projectId)
  if (!project.team_id) return []
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("team_id", project.team_id)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function fetchPapersForProject(projectId: string, limit = 50): Promise<Paper[]> {
  const project = await fetchProject(projectId)
  if (!project.team_id) return []
  const supabase = getSupabase()
  const taskIds = await supabase
    .from("tasks")
    .select("id")
    .eq("team_id", project.team_id)
  const ids = (taskIds.data ?? []).map((t) => t.id)
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from("papers")
    .select("*")
    .in("task_id", ids)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function fetchEventsForProject(projectId: string, limit = 200): Promise<TaskEventRow[]> {
  const project = await fetchProject(projectId)
  if (!project.team_id) return []
  const supabase = getSupabase()
  const taskIds = await supabase
    .from("tasks")
    .select("id")
    .eq("team_id", project.team_id)
  const ids = (taskIds.data ?? []).map((t) => t.id)
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from("task_events")
    .select("*")
    .in("task_id", ids)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).reverse()
}
