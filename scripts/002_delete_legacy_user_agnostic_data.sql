-- One-time cleanup: remove legacy data that is either visible to all users
-- (tasks with no team / team_id IS NULL) or belongs to ownerless teams (user_id IS NULL).
-- This is the "old data with nulls" that was showing in everyone's Research Console chat history.
-- Run this in the Supabase SQL editor when you're ready to drop old data.
-- Then run 003_hide_tasks_with_null_team_from_all.sql so RLS no longer shows such tasks.
-- Safe to run when tasks is empty (deletes nothing).

-- 1. Delete tasks that are "visible to all" (no team) or belong to ownerless teams.
--    task_events are removed automatically (ON DELETE CASCADE).
--    papers/experiments/research_directions get task_id set to NULL (ON DELETE SET NULL).
DELETE FROM tasks
WHERE team_id IS NULL
   OR team_id IN (SELECT id FROM teams WHERE user_id IS NULL);

-- 2. Delete team_agents for ownerless teams (required before we can delete those teams)
DELETE FROM team_agents
WHERE team_id IN (SELECT id FROM teams WHERE user_id IS NULL);

-- 3. Delete ownerless teams (created before user_id was added in 001_add_user_id_to_teams.sql)
DELETE FROM teams
WHERE user_id IS NULL;
