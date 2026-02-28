-- Migration 004: Chat history table + INSERT/UPDATE/DELETE policies for tasks
--
-- 1. Stores serialized chat messages per user in Supabase instead of
--    localStorage, so switching projects gives project-specific history.
-- 2. Adds write policies for tasks / task_events as a safety net.
--    The Modal backend should use the service_role key (which bypasses RLS),
--    but if the anon key was configured by mistake these policies let
--    authenticated users write through their own teams.

-- ── 1. Chat history table ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_history (
  user_id  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  messages jsonb   DEFAULT '[]',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_own_chat_history" ON chat_history;
CREATE POLICY "users_manage_own_chat_history" ON chat_history
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 2. INSERT / UPDATE / DELETE policies for tasks ──────────────────────

DROP POLICY IF EXISTS "users_insert_own_tasks" ON tasks;
CREATE POLICY "users_insert_own_tasks" ON tasks FOR INSERT
  WITH CHECK (
    team_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = tasks.team_id AND teams.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "users_update_own_tasks" ON tasks;
CREATE POLICY "users_update_own_tasks" ON tasks FOR UPDATE
  USING (
    team_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = tasks.team_id AND teams.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "users_delete_own_tasks" ON tasks;
CREATE POLICY "users_delete_own_tasks" ON tasks FOR DELETE
  USING (
    team_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = tasks.team_id AND teams.user_id = auth.uid()
    )
  );

-- ── 3. INSERT / UPDATE policies for task_events ─────────────────────────

DROP POLICY IF EXISTS "users_insert_own_task_events" ON task_events;
CREATE POLICY "users_insert_own_task_events" ON task_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN teams ON teams.id = t.team_id AND teams.user_id = auth.uid()
      WHERE t.id = task_events.task_id
    )
  );

DROP POLICY IF EXISTS "users_update_own_task_events" ON task_events;
CREATE POLICY "users_update_own_task_events" ON task_events FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN teams ON teams.id = t.team_id AND teams.user_id = auth.uid()
      WHERE t.id = task_events.task_id
    )
  );
