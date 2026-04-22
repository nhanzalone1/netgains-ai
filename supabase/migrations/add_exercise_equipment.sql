-- Add equipment column to exercises table
-- This allows PR tracking to distinguish between different equipment variants
-- (e.g., dumbbell lateral raise vs machine lateral raise)

ALTER TABLE public.exercises
ADD COLUMN equipment text NOT NULL DEFAULT 'barbell';

-- Add index for faster lookups when grouping by equipment
CREATE INDEX idx_exercises_equipment ON public.exercises(equipment);

-- Comment for documentation
COMMENT ON COLUMN public.exercises.equipment IS 'Equipment type used for this exercise (barbell, dumbbell, cable, machine, smith, bodyweight)';
