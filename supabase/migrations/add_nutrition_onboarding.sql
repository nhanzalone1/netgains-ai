-- Add nutrition onboarding flag to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nutrition_onboarding_complete boolean DEFAULT false;
