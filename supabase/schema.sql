-- NetGains Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles table (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- User's 1RM maxes for program generation
create table public.maxes (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles on delete cascade not null,
  squat integer not null default 0,
  bench integer not null default 0,
  deadlift integer not null default 0,
  overhead integer default 0,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Workout sessions
create table public.workouts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles on delete cascade not null,
  date date default current_date not null,
  notes text,
  created_at timestamptz default now() not null
);

-- Exercises within a workout
create table public.exercises (
  id uuid default uuid_generate_v4() primary key,
  workout_id uuid references public.workouts on delete cascade not null,
  name text not null,
  order_index integer not null default 0,
  created_at timestamptz default now() not null
);

-- Sets within an exercise
create table public.sets (
  id uuid default uuid_generate_v4() primary key,
  exercise_id uuid references public.exercises on delete cascade not null,
  weight numeric(7,1) not null,
  reps integer not null,
  order_index integer not null default 0,
  created_at timestamptz default now() not null
);

-- Coach long-term memory (key-value pairs per user)
create table public.coach_memory (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  key text not null,
  value text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Nutrition goals (daily targets)
create table public.nutrition_goals (
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
create table public.meals (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  date date not null default current_date,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack', 'meal')),
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

-- Indexes for common queries
create index idx_coach_memory_user_id on public.coach_memory(user_id);
create index idx_maxes_user_id on public.maxes(user_id);
create index idx_workouts_user_id on public.workouts(user_id);
create index idx_workouts_date on public.workouts(date);
create index idx_exercises_workout_id on public.exercises(workout_id);
create index idx_sets_exercise_id on public.sets(exercise_id);
create index idx_meals_user_id on public.meals(user_id);
create index idx_meals_date on public.meals(date);
create index idx_nutrition_goals_user_id on public.nutrition_goals(user_id);

-- Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.maxes enable row level security;
alter table public.workouts enable row level security;
alter table public.exercises enable row level security;
alter table public.sets enable row level security;
alter table public.coach_memory enable row level security;
alter table public.nutrition_goals enable row level security;
alter table public.meals enable row level security;

-- Profiles policies
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Maxes policies
create policy "Users can view own maxes"
  on public.maxes for select
  using (auth.uid() = user_id);

create policy "Users can insert own maxes"
  on public.maxes for insert
  with check (auth.uid() = user_id);

create policy "Users can update own maxes"
  on public.maxes for update
  using (auth.uid() = user_id);

create policy "Users can delete own maxes"
  on public.maxes for delete
  using (auth.uid() = user_id);

-- Workouts policies
create policy "Users can view own workouts"
  on public.workouts for select
  using (auth.uid() = user_id);

create policy "Users can insert own workouts"
  on public.workouts for insert
  with check (auth.uid() = user_id);

create policy "Users can update own workouts"
  on public.workouts for update
  using (auth.uid() = user_id);

create policy "Users can delete own workouts"
  on public.workouts for delete
  using (auth.uid() = user_id);

-- Exercises policies (via workout ownership)
create policy "Users can view own exercises"
  on public.exercises for select
  using (
    exists (
      select 1 from public.workouts
      where workouts.id = exercises.workout_id
      and workouts.user_id = auth.uid()
    )
  );

create policy "Users can insert own exercises"
  on public.exercises for insert
  with check (
    exists (
      select 1 from public.workouts
      where workouts.id = exercises.workout_id
      and workouts.user_id = auth.uid()
    )
  );

create policy "Users can update own exercises"
  on public.exercises for update
  using (
    exists (
      select 1 from public.workouts
      where workouts.id = exercises.workout_id
      and workouts.user_id = auth.uid()
    )
  );

create policy "Users can delete own exercises"
  on public.exercises for delete
  using (
    exists (
      select 1 from public.workouts
      where workouts.id = exercises.workout_id
      and workouts.user_id = auth.uid()
    )
  );

-- Sets policies (via exercise -> workout ownership)
create policy "Users can view own sets"
  on public.sets for select
  using (
    exists (
      select 1 from public.exercises
      join public.workouts on workouts.id = exercises.workout_id
      where exercises.id = sets.exercise_id
      and workouts.user_id = auth.uid()
    )
  );

create policy "Users can insert own sets"
  on public.sets for insert
  with check (
    exists (
      select 1 from public.exercises
      join public.workouts on workouts.id = exercises.workout_id
      where exercises.id = sets.exercise_id
      and workouts.user_id = auth.uid()
    )
  );

create policy "Users can update own sets"
  on public.sets for update
  using (
    exists (
      select 1 from public.exercises
      join public.workouts on workouts.id = exercises.workout_id
      where exercises.id = sets.exercise_id
      and workouts.user_id = auth.uid()
    )
  );

create policy "Users can delete own sets"
  on public.sets for delete
  using (
    exists (
      select 1 from public.exercises
      join public.workouts on workouts.id = exercises.workout_id
      where exercises.id = sets.exercise_id
      and workouts.user_id = auth.uid()
    )
  );

-- Coach memory policies
create policy "Users can view own memories"
  on public.coach_memory for select
  using (auth.uid() = user_id);

create policy "Users can insert own memories"
  on public.coach_memory for insert
  with check (auth.uid() = user_id);

create policy "Users can update own memories"
  on public.coach_memory for update
  using (auth.uid() = user_id);

create policy "Users can delete own memories"
  on public.coach_memory for delete
  using (auth.uid() = user_id);

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

-- Function to create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to create profile on signup
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Function to update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Triggers for updated_at
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

create trigger set_maxes_updated_at
  before update on public.maxes
  for each row execute procedure public.handle_updated_at();

create trigger set_coach_memory_updated_at
  before update on public.coach_memory
  for each row execute procedure public.handle_updated_at();

create trigger set_nutrition_goals_updated_at
  before update on public.nutrition_goals
  for each row execute procedure public.handle_updated_at();
