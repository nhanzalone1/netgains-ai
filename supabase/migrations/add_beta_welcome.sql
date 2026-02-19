-- Add beta_welcome_shown column to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS beta_welcome_shown boolean DEFAULT false;
