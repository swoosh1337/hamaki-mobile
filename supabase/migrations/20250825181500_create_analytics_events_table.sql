-- Create analytics_events table for app analytics
-- Tracks client-side events like post opens, tab taps, impressions, etc.

-- Ensure pgcrypto for gen_random_uuid()
create extension if not exists pgcrypto with schema public;

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Identity
  user_id text,
  session_id text,

  -- Event
  event_name text not null,

  -- Optional entity references / screen context
  post_id text,
  post_type text,
  screen text,
  tab text,

  -- Client context
  app_version text,
  device jsonb,
  context jsonb
);

-- Enable Row Level Security
alter table public.analytics_events enable row level security;

-- Allow inserts from anon (client) without exposing reads
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'analytics_events' and policyname = 'analytics_insert_policy'
  ) then
    create policy analytics_insert_policy on public.analytics_events
  for insert
  to anon
  with check (true);
  end if;
end $$;

-- Allow service role to read (e.g., server/BI tools)
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'analytics_events' and policyname = 'analytics_service_read_policy'
  ) then
    create policy analytics_service_read_policy on public.analytics_events
      for select
      to service_role
      using (true);
  end if;
end $$;

-- Helpful indexes for querying
create index if not exists idx_analytics_events_created_at on public.analytics_events (created_at desc);
create index if not exists idx_analytics_events_user_id on public.analytics_events (user_id);
create index if not exists idx_analytics_events_event_name on public.analytics_events (event_name);
create index if not exists idx_analytics_events_post_id on public.analytics_events (post_id);


