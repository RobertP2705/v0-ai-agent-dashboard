-- Migration 005: Make chat_history project-scoped
--
-- Changes the chat_history table from a single row per user to one row per
-- (user_id, project_id) pair, so each project keeps its own chat history.

-- 1. Drop the old table (single-row-per-user design)
DROP TABLE IF EXISTS chat_history;

-- 2. Recreate with composite primary key
CREATE TABLE chat_history (
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid        NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  messages   jsonb       DEFAULT '[]',
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, project_id)
);

-- 3. Keep RLS disabled (consistent with migration 004)
ALTER TABLE chat_history DISABLE ROW LEVEL SECURITY;
