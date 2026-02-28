-- Agents table: stores agent configuration and current status
create table if not exists public.agents (
  id text primary key,
  name text not null,
  status text not null default 'idle' check (status in ('idle', 'busy', 'error')),
  task text not null default '',
  cpu_current integer not null default 0,
  memory_current integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Chat logs table: stores chain-of-thought log entries
create table if not exists public.chat_logs (
  id text primary key,
  parent_id text references public.chat_logs(id) on delete cascade,
  timestamp text not null,
  agent text not null,
  type text not null check (type in ('thought', 'action', 'result', 'error')),
  message text not null,
  created_at timestamptz not null default now()
);

-- Token usage table: hourly snapshots of token consumption
create table if not exists public.token_usage (
  id uuid primary key default gen_random_uuid(),
  time_label text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

-- Meeting messages table: agent discussion transcripts
create table if not exists public.meeting_messages (
  id text primary key,
  agent text not null,
  message text not null,
  timestamp text not null,
  created_at timestamptz not null default now()
);

-- API usage stats table: tracks token counts and costs
create table if not exists public.api_usage_stats (
  id uuid primary key default gen_random_uuid(),
  total_tokens integer not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost numeric(10,4) not null default 0,
  requests_per_min integer not null default 0,
  recorded_at timestamptz not null default now()
);

-- Create indexes for common queries
create index if not exists idx_chat_logs_created_at on public.chat_logs(created_at desc);
create index if not exists idx_chat_logs_parent_id on public.chat_logs(parent_id);
create index if not exists idx_token_usage_created_at on public.token_usage(created_at desc);
create index if not exists idx_meeting_messages_created_at on public.meeting_messages(created_at desc);
create index if not exists idx_api_usage_stats_recorded_at on public.api_usage_stats(recorded_at desc);

-- Enable RLS on all tables (open read for now, write via service role)
alter table public.agents enable row level security;
alter table public.chat_logs enable row level security;
alter table public.token_usage enable row level security;
alter table public.meeting_messages enable row level security;
alter table public.api_usage_stats enable row level security;

-- Allow public read access (dashboard is a shared research tool)
create policy "agents_select_all" on public.agents for select using (true);
create policy "agents_insert_all" on public.agents for insert with check (true);
create policy "agents_update_all" on public.agents for update using (true);

create policy "chat_logs_select_all" on public.chat_logs for select using (true);
create policy "chat_logs_insert_all" on public.chat_logs for insert with check (true);

create policy "token_usage_select_all" on public.token_usage for select using (true);
create policy "token_usage_insert_all" on public.token_usage for insert with check (true);

create policy "meeting_messages_select_all" on public.meeting_messages for select using (true);
create policy "meeting_messages_insert_all" on public.meeting_messages for insert with check (true);

create policy "api_usage_stats_select_all" on public.api_usage_stats for select using (true);
create policy "api_usage_stats_insert_all" on public.api_usage_stats for insert with check (true);
