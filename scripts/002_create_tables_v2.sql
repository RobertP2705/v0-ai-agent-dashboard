-- Agents table
create table if not exists public.agents (
  id text primary key,
  name text not null,
  status text not null default 'idle',
  task text not null default '',
  cpu_current integer not null default 0,
  memory_current integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Chat logs table
create table if not exists public.chat_logs (
  id text primary key,
  parent_id text,
  timestamp text not null,
  agent text not null,
  type text not null,
  message text not null,
  created_at timestamptz not null default now()
);

-- Token usage table
create table if not exists public.token_usage (
  id uuid primary key default gen_random_uuid(),
  time_label text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

-- Meeting messages table
create table if not exists public.meeting_messages (
  id text primary key,
  agent text not null,
  message text not null,
  timestamp text not null,
  created_at timestamptz not null default now()
);

-- API usage stats table
create table if not exists public.api_usage_stats (
  id uuid primary key default gen_random_uuid(),
  total_tokens integer not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost numeric(10,4) not null default 0,
  requests_per_min integer not null default 0,
  recorded_at timestamptz not null default now()
);
