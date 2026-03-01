-- Add columns to support resuming long-running research after timeout (e.g. 750s).
-- resume_phase: 0 = not started, 1 = phase 1 done, 2 = phase 2 done, 3 = phase 3 done
-- resume_context: JSON with collector_summary and agent_results for resuming from that phase
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS resume_phase integer NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS resume_context jsonb;
