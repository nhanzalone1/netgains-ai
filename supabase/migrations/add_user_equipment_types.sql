-- Create user_equipment_types table for custom equipment per gym
-- Users can add custom equipment types like 'E-Gym' that appear in their exercise library

CREATE TABLE IF NOT EXISTS user_equipment_types (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gym_id BIGINT REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Each user can only have one equipment type with the same name per gym
  UNIQUE(user_id, gym_id, name)
);

-- Enable RLS
ALTER TABLE user_equipment_types ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only see/modify their own equipment types
CREATE POLICY "Users can view their own equipment types"
  ON user_equipment_types FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own equipment types"
  ON user_equipment_types FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own equipment types"
  ON user_equipment_types FOR DELETE
  USING (auth.uid() = user_id);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_equipment_types_user_gym
  ON user_equipment_types(user_id, gym_id);

-- Add comment for documentation
COMMENT ON TABLE user_equipment_types IS 'Custom equipment types created by users, can be gym-specific';
