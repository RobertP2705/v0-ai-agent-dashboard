-- 004: Create research_projects table and link tasks to projects

-- Research projects table
CREATE TABLE IF NOT EXISTS research_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'setup',  -- setup | active | completed | archived
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add project_id FK to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES research_projects(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE research_projects ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only see/modify their own projects
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own projects' AND tablename = 'research_projects') THEN
    CREATE POLICY "Users can view own projects" ON research_projects
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own projects' AND tablename = 'research_projects') THEN
    CREATE POLICY "Users can insert own projects" ON research_projects
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own projects' AND tablename = 'research_projects') THEN
    CREATE POLICY "Users can update own projects" ON research_projects
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete own projects' AND tablename = 'research_projects') THEN
    CREATE POLICY "Users can delete own projects" ON research_projects
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE research_projects;
