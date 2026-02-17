-- Add coaching_mode column to profiles table
-- Tracks whether coach builds program ('full') or user brings their own ('assist')

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS coaching_mode text DEFAULT NULL;

-- Also ensure other onboarding columns exist
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS onboarding_complete boolean DEFAULT false;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS height_inches integer;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS weight_lbs numeric;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS goal text;

-- App tour flag (one-time message shown after onboarding)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS app_tour_shown boolean DEFAULT false;
