-- ==============================================================================
-- Hindustan Saw Mill & Wood Industries (Since 1971)
-- Supabase Database Schema & Open Access Policies
-- Allows anyone to access, calculate, save, and manage measurement sheets without login.
-- ==============================================================================

-- 1. Quick Fix for Existing Tables (Disables RLS & drops auth constraints)
ALTER TABLE IF EXISTS public.measurement_sheets DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.measurement_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles DISABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.measurement_sheets ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE IF EXISTS public.measurement_items ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE IF EXISTS public.measurement_sheets DROP CONSTRAINT IF EXISTS measurement_sheets_user_id_fkey;
ALTER TABLE IF EXISTS public.measurement_items DROP CONSTRAINT IF EXISTS measurement_items_user_id_fkey;

-- 2. Create Profiles Table (Optional Profile Storage)
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null default 'staff@hindustansawmill.com',
  full_name text default 'Hindustan Saw Mill Staff',
  role text not null default 'admin',
  company_name text default 'Hindustan Saw Mill & Wood Industries',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 2. Create Measurement Sheets Table (Open to Anyone)
create table if not exists public.measurement_sheets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid default '00000000-0000-0000-0000-000000000001',
  sheet_name text not null,
  customer_name text default '',
  project_name text default '',
  reference_number text default '',
  measurement_date date default current_date not null,
  notes text default '',
  total_entries integer default 0 not null,
  total_pieces numeric(12, 3) default 0 not null,
  total_cft numeric(14, 4) default 0 not null,
  total_sqft numeric(14, 4) default 0 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 3. Create Measurement Items Table (Individual Tally Rows)
create table if not exists public.measurement_items (
  id uuid default gen_random_uuid() primary key,
  sheet_id uuid references public.measurement_sheets(id) on delete cascade not null,
  user_id uuid default '00000000-0000-0000-0000-000000000001',
  serial_number integer not null,
  length_feet numeric(10, 3) not null check (length_feet > 0),
  width_inches numeric(10, 3) not null check (width_inches > 0),
  thickness_inches numeric(10, 3) not null check (thickness_inches > 0),
  number_of_pieces numeric(10, 3) not null check (number_of_pieces > 0),
  cft numeric(14, 4) not null,
  sqft numeric(14, 4) not null,
  wood_type text default '',
  remarks text default '',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 4. Create Performance Indexes
create index if not exists idx_sheets_date on public.measurement_sheets (measurement_date desc);
create index if not exists idx_sheets_created_at on public.measurement_sheets (created_at desc);
create index if not exists idx_items_sheet_id on public.measurement_items (sheet_id, serial_number asc);

-- 5. Enable Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.measurement_sheets enable row level security;
alter table public.measurement_items enable row level security;

-- 6. Open Access Policies (Anyone can Read, Insert, Update, Delete)
drop policy if exists "Allow all on measurement_sheets" on public.measurement_sheets;
create policy "Allow all on measurement_sheets"
  on public.measurement_sheets
  for all
  using (true)
  with check (true);

drop policy if exists "Allow all on measurement_items" on public.measurement_items;
create policy "Allow all on measurement_items"
  on public.measurement_items
  for all
  using (true)
  with check (true);

drop policy if exists "Allow all on profiles" on public.profiles;
create policy "Allow all on profiles"
  on public.profiles
  for all
  using (true)
  with check (true);

-- 7. Updated_at Auto-Timestamp Trigger
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_sheets_timestamp on public.measurement_sheets;
create trigger update_sheets_timestamp
  before update on public.measurement_sheets
  for each row execute function public.handle_updated_at();

drop trigger if exists update_items_timestamp on public.measurement_items;
create trigger update_items_timestamp
  before update on public.measurement_items
  for each row execute function public.handle_updated_at();
