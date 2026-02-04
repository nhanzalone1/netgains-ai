-- NetGains V41 Migration: Locations, Folders, and Exercise Templates
-- Run this in your Supabase SQL Editor

-- Locations table (gyms)
create table public.locations (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles on delete cascade not null,
  name text not null,
  is_default boolean default false,
  created_at timestamptz default now() not null
);

-- Folders table (workout splits like Chest/Tri, Back/Bi)
create table public.folders (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles on delete cascade not null,
  location_id uuid references public.locations on delete cascade not null,
  name text not null,
  order_index integer not null default 0,
  created_at timestamptz default now() not null
);

-- Exercise templates (reusable exercise definitions)
create table public.exercise_templates (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles on delete cascade not null,
  folder_id uuid references public.folders on delete cascade not null,
  name text not null,
  equipment text not null default 'barbell', -- barbell, dumbbell, cable, machine, smith
  exercise_type text not null default 'strength', -- strength, cardio
  order_index integer not null default 0,
  created_at timestamptz default now() not null
);

-- Program cycles (5/3/1 weeks)
create table public.program_cycles (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles on delete cascade not null,
  current_week integer not null default 1, -- 1-4
  started_at timestamptz default now() not null,
  created_at timestamptz default now() not null
);

-- Indexes
create index idx_locations_user_id on public.locations(user_id);
create index idx_folders_user_id on public.folders(user_id);
create index idx_folders_location_id on public.folders(location_id);
create index idx_exercise_templates_folder_id on public.exercise_templates(folder_id);
create index idx_program_cycles_user_id on public.program_cycles(user_id);

-- Enable RLS
alter table public.locations enable row level security;
alter table public.folders enable row level security;
alter table public.exercise_templates enable row level security;
alter table public.program_cycles enable row level security;

-- Locations policies
create policy "Users can view own locations"
  on public.locations for select
  using (auth.uid() = user_id);

create policy "Users can insert own locations"
  on public.locations for insert
  with check (auth.uid() = user_id);

create policy "Users can update own locations"
  on public.locations for update
  using (auth.uid() = user_id);

create policy "Users can delete own locations"
  on public.locations for delete
  using (auth.uid() = user_id);

-- Folders policies
create policy "Users can view own folders"
  on public.folders for select
  using (auth.uid() = user_id);

create policy "Users can insert own folders"
  on public.folders for insert
  with check (auth.uid() = user_id);

create policy "Users can update own folders"
  on public.folders for update
  using (auth.uid() = user_id);

create policy "Users can delete own folders"
  on public.folders for delete
  using (auth.uid() = user_id);

-- Exercise templates policies
create policy "Users can view own exercise templates"
  on public.exercise_templates for select
  using (auth.uid() = user_id);

create policy "Users can insert own exercise templates"
  on public.exercise_templates for insert
  with check (auth.uid() = user_id);

create policy "Users can update own exercise templates"
  on public.exercise_templates for update
  using (auth.uid() = user_id);

create policy "Users can delete own exercise templates"
  on public.exercise_templates for delete
  using (auth.uid() = user_id);

-- Program cycles policies
create policy "Users can view own program cycles"
  on public.program_cycles for select
  using (auth.uid() = user_id);

create policy "Users can insert own program cycles"
  on public.program_cycles for insert
  with check (auth.uid() = user_id);

create policy "Users can update own program cycles"
  on public.program_cycles for update
  using (auth.uid() = user_id);

create policy "Users can delete own program cycles"
  on public.program_cycles for delete
  using (auth.uid() = user_id);
