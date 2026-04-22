-- Add AI data consent column to profiles table
-- This tracks whether users have consented to their data being sent to Anthropic's Claude AI

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS consent_ai_data boolean DEFAULT false;

COMMENT ON COLUMN public.profiles.consent_ai_data IS 'Whether user has consented to AI data processing via Anthropic Claude. Required for App Store compliance.';

-- Set all existing users to false so they must go through the consent flow
UPDATE public.profiles SET consent_ai_data = false WHERE consent_ai_data IS NULL;
