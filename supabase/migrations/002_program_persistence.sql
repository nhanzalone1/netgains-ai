-- NetGains V41 Migration: Program Auto-Save Persistence
-- Run this in your Supabase SQL Editor

-- Program Settings table (stores user's 1RM maxes)
create table public.program_settings (
  user_id uuid references public.profiles on delete cascade primary key,
  squat_max integer not null default 0,
  bench_max integer not null default 0,
  deadlift_max integer not null default 0,
  current_week integer not null default 1,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Program Progress table (tracks completed days)
create table public.program_progress (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles on delete cascade not null,
  week_number integer not null,
  day text not null check (day in ('MON', 'WED', 'FRI')),
  is_complete boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz default now() not null,

  -- Unique constraint: one entry per user/week/day combination
  unique(user_id, week_number, day)
);

-- Indexes
create index idx_program_settings_user_id on public.program_settings(user_id);
create index idx_program_progress_user_id on public.program_progress(user_id);
create index idx_program_progress_week on public.program_progress(user_id, week_number);

-- Enable RLS
alter table public.program_settings enable row level security;
alter table public.program_progress enable row level security;

-- Program Settings policies
create policy "Users can view own program settings"
  on public.program_settings for select
  using (auth.uid() = user_id);

create policy "Users can insert own program settings"
  on public.program_settings for insert
  with check (auth.uid() = user_id);

create policy "Users can update own program settings"
  on public.program_settings for update
  using (auth.uid() = user_id);

create policy "Users can delete own program settings"
  on public.program_settings for delete
  using (auth.uid() = user_id);

-- Program Progress policies
create policy "Users can view own program progress"
  on public.program_progress for select
  using (auth.uid() = user_id);

create policy "Users can insert own program progress"
  on public.program_progress for insert
  with check (auth.uid() = user_id);

create policy "Users can update own program progress"
  on public.program_progress for update
  using (auth.uid() = user_id);

create policy "Users can delete own program progress"
  on public.program_progress for delete
  using (auth.uid() = user_id);

-- Trigger for updated_at on program_settings
create trigger set_program_settings_updated_at
  before update on public.program_settings
  for each row execute procedure public.handle_updated_at();
