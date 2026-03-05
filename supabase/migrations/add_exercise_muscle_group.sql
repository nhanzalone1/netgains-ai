-- Add muscle_group column to exercise_templates table
-- Detailed categorization: specific delt heads, separate biceps/triceps

ALTER TABLE public.exercise_templates
ADD COLUMN IF NOT EXISTS muscle_group text;

-- Add check constraint for valid muscle groups
ALTER TABLE public.exercise_templates
ADD CONSTRAINT exercise_templates_muscle_group_check
CHECK (muscle_group IS NULL OR muscle_group IN (
  'chest',
  'front_delt',
  'side_delt',
  'rear_delt',
  'lats',
  'upper_back',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'other'
));

-- Comment for documentation
COMMENT ON COLUMN public.exercise_templates.muscle_group IS 'Detailed muscle group: chest, front_delt, side_delt, rear_delt, lats, upper_back, biceps, triceps, quads, hamstrings, glutes, calves, core, other';
