-- NetGains Migration: Muscle Group Refactor
-- Decouples exercises from split days, ties them to muscle groups instead
--
-- Changes:
-- 1. Add gym_id and is_gym_specific to exercise_templates
-- 2. Add gym_id and is_gym_specific to exercises (workout logs) for PR tracking
-- 3. Create split_muscle_groups mapping table
-- 4. Migrate muscle_group values: lats/upper_back → back, core → abs

-- ============================================
-- PHASE 1: Add columns to exercise_templates
-- ============================================

-- Add gym_id (which gym this exercise belongs to)
ALTER TABLE public.exercise_templates
ADD COLUMN IF NOT EXISTS gym_id bigint REFERENCES public.locations ON DELETE SET NULL;

-- Add is_gym_specific flag (machine/cable/smith = true, barbell/dumbbell/bodyweight = false)
ALTER TABLE public.exercise_templates
ADD COLUMN IF NOT EXISTS is_gym_specific boolean DEFAULT true;

-- Index for gym-based queries
CREATE INDEX IF NOT EXISTS idx_exercise_templates_gym_id
ON public.exercise_templates(gym_id);

-- GIN index for muscle_group array queries
CREATE INDEX IF NOT EXISTS idx_exercise_templates_muscle_group
ON public.exercise_templates USING GIN(muscle_group);

-- ============================================
-- PHASE 2: Add columns to exercises (workout logs)
-- ============================================

-- Add gym_id for PR separation by gym
ALTER TABLE public.exercises
ADD COLUMN IF NOT EXISTS gym_id bigint REFERENCES public.locations ON DELETE SET NULL;

-- Add is_gym_specific (copied from template at log time)
ALTER TABLE public.exercises
ADD COLUMN IF NOT EXISTS is_gym_specific boolean DEFAULT true;

-- Index for PR queries by gym
CREATE INDEX IF NOT EXISTS idx_exercises_gym_id
ON public.exercises(gym_id);

-- ============================================
-- PHASE 3: Create split_muscle_groups table
-- ============================================

CREATE TABLE IF NOT EXISTS public.split_muscle_groups (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES public.profiles ON DELETE CASCADE NOT NULL,
  folder_id bigint REFERENCES public.folders ON DELETE CASCADE NOT NULL,
  muscle_groups text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(folder_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_split_muscle_groups_user_id
ON public.split_muscle_groups(user_id);

CREATE INDEX IF NOT EXISTS idx_split_muscle_groups_folder_id
ON public.split_muscle_groups(folder_id);

-- Enable RLS
ALTER TABLE public.split_muscle_groups ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DO $$
BEGIN
  -- Drop existing policies if they exist (for idempotency)
  DROP POLICY IF EXISTS "Users can view own split mappings" ON public.split_muscle_groups;
  DROP POLICY IF EXISTS "Users can insert own split mappings" ON public.split_muscle_groups;
  DROP POLICY IF EXISTS "Users can update own split mappings" ON public.split_muscle_groups;
  DROP POLICY IF EXISTS "Users can delete own split mappings" ON public.split_muscle_groups;
END $$;

CREATE POLICY "Users can view own split mappings"
  ON public.split_muscle_groups FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own split mappings"
  ON public.split_muscle_groups FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own split mappings"
  ON public.split_muscle_groups FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own split mappings"
  ON public.split_muscle_groups FOR DELETE
  USING (auth.uid() = user_id);

-- Updated_at trigger
DROP TRIGGER IF EXISTS set_split_muscle_groups_updated_at ON public.split_muscle_groups;
CREATE TRIGGER set_split_muscle_groups_updated_at
  BEFORE UPDATE ON public.split_muscle_groups
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- ============================================
-- PHASE 4: Populate gym_id on exercise_templates
-- ============================================

-- Set gym_id from folder → location relationship
UPDATE public.exercise_templates et
SET gym_id = f.location_id
FROM public.folders f
WHERE et.folder_id = f.id
AND et.gym_id IS NULL;

-- ============================================
-- PHASE 5: Set is_gym_specific based on equipment
-- ============================================

-- Gym-specific: machine, cable, smith (equipment varies by gym)
-- Universal: barbell, dumbbell, bodyweight, plate (available everywhere)
UPDATE public.exercise_templates
SET is_gym_specific = CASE
  WHEN equipment IN ('machine', 'cable', 'smith') THEN true
  ELSE false
END
WHERE is_gym_specific IS NULL OR is_gym_specific = true;

-- ============================================
-- PHASE 6: Migrate muscle_group values
-- ============================================

-- Drop old constraint if exists
ALTER TABLE public.exercise_templates
DROP CONSTRAINT IF EXISTS exercise_templates_muscle_group_check;

-- Update muscle_group values: lats/upper_back → back, core → abs
-- This handles the array transformation
UPDATE public.exercise_templates
SET muscle_group = (
  SELECT ARRAY(
    SELECT DISTINCT
      CASE
        WHEN val = 'lats' THEN 'back'
        WHEN val = 'upper_back' THEN 'back'
        WHEN val = 'core' THEN 'abs'
        ELSE val
      END
    FROM unnest(muscle_group) AS val
    WHERE val IS NOT NULL
  )
)
WHERE muscle_group IS NOT NULL
AND muscle_group != '{}';

-- Add new constraint with updated muscle groups
-- (13 groups: chest, back, biceps, triceps, front_delt, side_delt, rear_delt,
--  quads, hamstrings, glutes, calves, abs, forearms)
ALTER TABLE public.exercise_templates
ADD CONSTRAINT exercise_templates_muscle_group_check
CHECK (
  muscle_group IS NULL
  OR muscle_group = '{}'
  OR muscle_group <@ ARRAY[
    'chest',
    'back',
    'biceps',
    'triceps',
    'front_delt',
    'side_delt',
    'rear_delt',
    'quads',
    'hamstrings',
    'glutes',
    'calves',
    'abs',
    'forearms'
  ]::text[]
);

-- ============================================
-- COMMENTS for documentation
-- ============================================

COMMENT ON COLUMN public.exercise_templates.gym_id IS 'Which gym/location this exercise belongs to';
COMMENT ON COLUMN public.exercise_templates.is_gym_specific IS 'true for machine/cable/smith (gym-specific), false for barbell/dumbbell/bodyweight (universal)';
COMMENT ON COLUMN public.exercise_templates.muscle_group IS 'Primary muscle groups: chest, back, biceps, triceps, front_delt, side_delt, rear_delt, quads, hamstrings, glutes, calves, abs, forearms';

COMMENT ON COLUMN public.exercises.gym_id IS 'Gym where this exercise was logged (for PR separation)';
COMMENT ON COLUMN public.exercises.is_gym_specific IS 'Copied from template at log time for PR queries';

COMMENT ON TABLE public.split_muscle_groups IS 'Maps split days (folders) to muscle groups for exercise filtering';
