-- Stop showing tasks with null team_id in the Research Console chat history.
-- Currently those tasks are visible to all users; after this, only tasks in
-- the current user's teams are visible.
-- Safe to run even when tasks is empty (no effect until you have data).

-- Tasks: only show tasks that belong to a team owned by the current user.
-- (Tasks with team_id IS NULL will no longer be visible to anyone.)
DROP POLICY IF EXISTS "users_select_own_tasks" ON tasks;
CREATE POLICY "users_select_own_tasks" ON tasks FOR SELECT
  USING (
    tasks.team_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = tasks.team_id AND teams.user_id = auth.uid()
    )
  );

-- Task events: only show events for tasks that belong to the current user's teams.
DROP POLICY IF EXISTS "users_select_own_task_events" ON task_events;
CREATE POLICY "users_select_own_task_events" ON task_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN teams ON teams.id = t.team_id AND teams.user_id = auth.uid()
      WHERE t.id = task_events.task_id
    )
  );

-- Papers: only show papers for tasks in user's teams (or orphan papers if you want to hide those too).
DROP POLICY IF EXISTS "users_select_own_papers" ON papers;
CREATE POLICY "users_select_own_papers" ON papers FOR SELECT
  USING (
    papers.task_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM tasks t
      JOIN teams ON teams.id = t.team_id AND teams.user_id = auth.uid()
      WHERE t.id = papers.task_id
    )
  );

-- Experiments: same as papers.
DROP POLICY IF EXISTS "users_select_own_experiments" ON experiments;
CREATE POLICY "users_select_own_experiments" ON experiments FOR SELECT
  USING (
    experiments.task_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM tasks t
      JOIN teams ON teams.id = t.team_id AND teams.user_id = auth.uid()
      WHERE t.id = experiments.task_id
    )
  );

-- Research directions: same as papers.
DROP POLICY IF EXISTS "users_select_own_directions" ON research_directions;
CREATE POLICY "users_select_own_directions" ON research_directions FOR SELECT
  USING (
    research_directions.task_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM tasks t
      JOIN teams ON teams.id = t.team_id AND teams.user_id = auth.uid()
      WHERE t.id = research_directions.task_id
    )
  );
