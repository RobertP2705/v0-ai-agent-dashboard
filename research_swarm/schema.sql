-- Research Swarm Supabase Schema
-- Run this in the Supabase SQL editor to set up all tables.

-- Teams and agent configuration
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  created_at timestamptz default now()
);

create table if not exists team_agents (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade not null,
  agent_type text not null,
  config jsonb default '{}',
  enabled boolean default true
);

-- Task execution
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete set null,
  query text not null,
  status text not null default 'pending',
  assigned_agents text[] default '{}',
  merged_answer text default '',
  total_usage jsonb default '{"prompt_tokens":0,"completion_tokens":0,"total_tokens":0}',
  created_at timestamptz default now()
);

create table if not exists task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade not null,
  agent_type text not null,
  event_type text not null,
  message text not null,
  meta jsonb default '{}',
  created_at timestamptz default now()
);

-- Paper collector output
create table if not exists papers (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete set null,
  arxiv_id text,
  title text not null,
  authors text[] default '{}',
  abstract text default '',
  summary text default '',
  pdf_url text default '',
  created_at timestamptz default now()
);

-- Implementer output
create table if not exists experiments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete set null,
  paper_id uuid references papers(id) on delete set null,
  code text default '',
  wandb_run_url text default '',
  github_repo text default '',
  github_commit text default '',
  status text not null default 'pending',
  metrics jsonb default '{}',
  created_at timestamptz default now()
);

-- Research director output
create table if not exists research_directions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete set null,
  title text not null,
  rationale text default '',
  feasibility_score float default 0,
  novelty_score float default 0,
  related_papers uuid[] default '{}',
  created_at timestamptz default now()
);

-- Enable realtime on task_events for live streaming
alter publication supabase_realtime add table task_events;
alter publication supabase_realtime add table tasks;
