-- Migration: Add Nutrition Tables
-- Run this in Supabase SQL Editor if you already have the base schema

-- Nutrition goals (daily targets)
create table if not exists public.nutrition_goals (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null unique,
  calories integer not null default 2000,
  protein integer not null default 150,
  carbs integer not null default 200,
  fat integer not null default 65,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Meals (food log entries)
create table if not exists public.meals (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  date date not null default current_date,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  food_name text not null,
  calories integer not null default 0,
  protein integer not null default 0,
  carbs integer not null default 0,
  fat integer not null default 0,
  serving_size text,
  ai_generated boolean not null default false,
  consumed boolean not null default true,
  created_at timestamptz default now() not null
);

-- Indexes
create index if not exists idx_meals_user_id on public.meals(user_id);
create index if not exists idx_meals_date on public.meals(date);
create index if not exists idx_nutrition_goals_user_id on public.nutrition_goals(user_id);

-- Enable RLS
alter table public.nutrition_goals enable row level security;
alter table public.meals enable row level security;

-- Nutrition goals policies
create policy "Users can view own nutrition goals"
  on public.nutrition_goals for select
  using (auth.uid() = user_id);

create policy "Users can insert own nutrition goals"
  on public.nutrition_goals for insert
  with check (auth.uid() = user_id);

create policy "Users can update own nutrition goals"
  on public.nutrition_goals for update
  using (auth.uid() = user_id);

create policy "Users can delete own nutrition goals"
  on public.nutrition_goals for delete
  using (auth.uid() = user_id);

-- Meals policies
create policy "Users can view own meals"
  on public.meals for select
  using (auth.uid() = user_id);

create policy "Users can insert own meals"
  on public.meals for insert
  with check (auth.uid() = user_id);

create policy "Users can update own meals"
  on public.meals for update
  using (auth.uid() = user_id);

create policy "Users can delete own meals"
  on public.meals for delete
  using (auth.uid() = user_id);

-- Trigger for updated_at
create trigger set_nutrition_goals_updated_at
  before update on public.nutrition_goals
  for each row execute procedure public.handle_updated_at();
