-- 007: Task reports (PDF agent output) and storage
--
-- 1. Creates task_reports table for generated PDF metadata.
-- 2. Storage bucket "reports" must be created in Supabase Dashboard (Storage)
--    with path pattern: {task_id}/{uuid}.pdf
--    Set bucket to public if you want direct public_url links, or use signed URLs from the app.

-- ── 1. Task reports table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS task_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  title text NOT NULL,
  file_name text NOT NULL DEFAULT 'report.pdf',
  storage_path text NOT NULL,
  public_url text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Index for listing reports by task and by time
CREATE INDEX IF NOT EXISTS task_reports_task_id_idx ON task_reports(task_id);
CREATE INDEX IF NOT EXISTS task_reports_created_at_idx ON task_reports(created_at DESC);

-- RLS: leave disabled to match other tables (004_chat_history_and_task_rls.sql)
ALTER TABLE task_reports DISABLE ROW LEVEL SECURITY;

-- Optional: when enabling RLS later, allow SELECT for tasks the user can see, e.g.:
-- CREATE POLICY "users_select_own_task_reports" ON task_reports FOR SELECT
--   USING (
--     EXISTS (
--       SELECT 1 FROM tasks t
--       JOIN research_projects rp ON rp.id = t.project_id
--       WHERE t.id = task_reports.task_id AND rp.user_id = auth.uid()
--     )
--   );

-- Realtime (optional)
-- ALTER PUBLICATION supabase_realtime ADD TABLE task_reports;
