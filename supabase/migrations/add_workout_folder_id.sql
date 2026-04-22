-- Add folder_id and location_id to workouts table for "Load Previous Workout" feature
-- This allows querying the most recent workout for a specific split day at a specific gym

-- Note: folders.id is bigint, not uuid
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS folder_id bigint REFERENCES folders(id) ON DELETE SET NULL;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS location_id bigint REFERENCES locations(id) ON DELETE SET NULL;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_workouts_folder_id ON workouts(folder_id);
CREATE INDEX IF NOT EXISTS idx_workouts_location_id ON workouts(location_id);
CREATE INDEX IF NOT EXISTS idx_workouts_user_folder_location ON workouts(user_id, folder_id, location_id);
