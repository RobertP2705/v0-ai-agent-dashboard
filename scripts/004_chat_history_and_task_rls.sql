-- Migration 004: Chat history table + disable RLS on all tables
--
-- 1. Creates chat_history table to store messages per user in Supabase
--    instead of localStorage (so switching projects gives project-specific history).
-- 2. Disables RLS on all tables for simplicity.

-- ── 1. Chat history table ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_history (
  user_id  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  messages jsonb   DEFAULT '[]',
  updated_at timestamptz DEFAULT now()
);

-- ── 2. Disable RLS on every table ───────────────────────────────────────

ALTER TABLE teams              DISABLE ROW LEVEL SECURITY;
ALTER TABLE team_agents        DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks              DISABLE ROW LEVEL SECURITY;
ALTER TABLE task_events        DISABLE ROW LEVEL SECURITY;
ALTER TABLE papers             DISABLE ROW LEVEL SECURITY;
ALTER TABLE experiments        DISABLE ROW LEVEL SECURITY;
ALTER TABLE research_directions DISABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history       DISABLE ROW LEVEL SECURITY;
