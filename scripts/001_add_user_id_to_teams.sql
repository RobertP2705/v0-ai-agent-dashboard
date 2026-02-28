-- Add user_id column to teams table to associate teams with authenticated users
ALTER TABLE teams ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create an index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_teams_user_id ON teams(user_id);

-- Enable Row Level Security on teams
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see their own teams
DROP POLICY IF EXISTS "users_select_own_teams" ON teams;
CREATE POLICY "users_select_own_teams" ON teams FOR SELECT USING (auth.uid() = user_id);

-- Policy: users can insert teams only for themselves
DROP POLICY IF EXISTS "users_insert_own_teams" ON teams;
CREATE POLICY "users_insert_own_teams" ON teams FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: users can update their own teams
DROP POLICY IF EXISTS "users_update_own_teams" ON teams;
CREATE POLICY "users_update_own_teams" ON teams FOR UPDATE USING (auth.uid() = user_id);

-- Policy: users can delete their own teams
DROP POLICY IF EXISTS "users_delete_own_teams" ON teams;
CREATE POLICY "users_delete_own_teams" ON teams FOR DELETE USING (auth.uid() = user_id);

-- Enable RLS on team_agents (access controlled via team ownership)
ALTER TABLE team_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_team_agents" ON team_agents;
CREATE POLICY "users_select_own_team_agents" ON team_agents FOR SELECT
  USING (EXISTS (SELECT 1 FROM teams WHERE teams.id = team_agents.team_id AND teams.user_id = auth.uid()));

DROP POLICY IF EXISTS "users_insert_own_team_agents" ON team_agents;
CREATE POLICY "users_insert_own_team_agents" ON team_agents FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM teams WHERE teams.id = team_agents.team_id AND teams.user_id = auth.uid()));

DROP POLICY IF EXISTS "users_update_own_team_agents" ON team_agents;
CREATE POLICY "users_update_own_team_agents" ON team_agents FOR UPDATE
  USING (EXISTS (SELECT 1 FROM teams WHERE teams.id = team_agents.team_id AND teams.user_id = auth.uid()));

DROP POLICY IF EXISTS "users_delete_own_team_agents" ON team_agents;
CREATE POLICY "users_delete_own_team_agents" ON team_agents FOR DELETE
  USING (EXISTS (SELECT 1 FROM teams WHERE teams.id = team_agents.team_id AND teams.user_id = auth.uid()));

-- Enable RLS on tasks
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_tasks" ON tasks;
CREATE POLICY "users_select_own_tasks" ON tasks FOR SELECT
  USING (
    team_id IS NULL 
    OR EXISTS (SELECT 1 FROM teams WHERE teams.id = tasks.team_id AND teams.user_id = auth.uid())
  );

-- Enable RLS on task_events
ALTER TABLE task_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_task_events" ON task_events;
CREATE POLICY "users_select_own_task_events" ON task_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tasks 
      WHERE tasks.id = task_events.task_id 
      AND (tasks.team_id IS NULL OR EXISTS (SELECT 1 FROM teams WHERE teams.id = tasks.team_id AND teams.user_id = auth.uid()))
    )
  );

-- Enable RLS on papers
ALTER TABLE papers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_papers" ON papers;
CREATE POLICY "users_select_own_papers" ON papers FOR SELECT
  USING (
    task_id IS NULL 
    OR EXISTS (
      SELECT 1 FROM tasks 
      WHERE tasks.id = papers.task_id 
      AND (tasks.team_id IS NULL OR EXISTS (SELECT 1 FROM teams WHERE teams.id = tasks.team_id AND teams.user_id = auth.uid()))
    )
  );

-- Enable RLS on experiments
ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_experiments" ON experiments;
CREATE POLICY "users_select_own_experiments" ON experiments FOR SELECT
  USING (
    task_id IS NULL 
    OR EXISTS (
      SELECT 1 FROM tasks 
      WHERE tasks.id = experiments.task_id 
      AND (tasks.team_id IS NULL OR EXISTS (SELECT 1 FROM teams WHERE teams.id = tasks.team_id AND teams.user_id = auth.uid()))
    )
  );

-- Enable RLS on research_directions
ALTER TABLE research_directions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_directions" ON research_directions;
CREATE POLICY "users_select_own_directions" ON research_directions FOR SELECT
  USING (
    task_id IS NULL 
    OR EXISTS (
      SELECT 1 FROM tasks 
      WHERE tasks.id = research_directions.task_id 
      AND (tasks.team_id IS NULL OR EXISTS (SELECT 1 FROM teams WHERE teams.id = tasks.team_id AND teams.user_id = auth.uid()))
    )
  );
