-- Add coaching_intensity column to profiles table
-- Run this in your Supabase SQL Editor

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS coaching_intensity text
DEFAULT 'moderate'
CHECK (coaching_intensity IN ('light', 'moderate', 'aggressive'));

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.coaching_intensity IS 'Coach tone: light (encouraging), moderate (direct), aggressive (blunt accountability)';
