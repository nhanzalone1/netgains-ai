-- Add cardio_notes column to workouts table
-- This allows users to log cardio activities with their workouts

ALTER TABLE workouts ADD COLUMN IF NOT EXISTS cardio_notes TEXT;

-- Add comment for documentation
COMMENT ON COLUMN workouts.cardio_notes IS 'Free-text field for logging cardio activities (e.g., "25 min incline walk, 10% incline, 3.2 mph")';
