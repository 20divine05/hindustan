-- =========================================================================
-- Hindustan Saw Mill & Wood Industries
-- Visitor Access Control & Device Approval Schema
-- Migration: 20261125_create_app_visitors.sql
-- =========================================================================

create table if not exists public.app_visitors (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  ip_address text not null,
  city text default '',
  region text default '',
  country text default '',
  isp text default '',
  device_type text default '',
  browser text default '',
  os text default '',
  user_agent text default '',
  status text not null default 'pending', -- 'pending' | 'approved' | 'blocked'
  label text default '',
  first_seen timestamptz default now(),
  last_seen timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Performance indices for lightning fast lookup
create index if not exists idx_app_visitors_device on public.app_visitors (device_id);
create index if not exists idx_app_visitors_ip on public.app_visitors (ip_address);
create index if not exists idx_app_visitors_status on public.app_visitors (status);
create index if not exists idx_app_visitors_last_seen on public.app_visitors (last_seen desc);

-- Enable Row Level Security (RLS)
alter table public.app_visitors enable row level security;

-- Policies allowing public client access
create policy "Allow public read app_visitors" on public.app_visitors for select using (true);
create policy "Allow public insert app_visitors" on public.app_visitors for insert with check (true);
create policy "Allow public update app_visitors" on public.app_visitors for update using (true);
create policy "Allow public delete app_visitors" on public.app_visitors for delete using (true);
