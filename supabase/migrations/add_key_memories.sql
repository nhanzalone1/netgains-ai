-- Add key_memories JSONB column to profiles table
-- This stores user preferences that the coach should always remember

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS key_memories JSONB DEFAULT '{}'::jsonb;

-- Add a comment to document the expected structure
COMMENT ON COLUMN profiles.key_memories IS 'User preferences for coach: { supplements: string, food_available: string, preferences: string, injuries: string }';

-- Set default empty object for existing users
UPDATE profiles
SET key_memories = '{}'::jsonb
WHERE key_memories IS NULL;
