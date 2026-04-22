-- Add terms_accepted_at to track when user accepted terms of service and privacy policy
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

-- Comment for documentation
COMMENT ON COLUMN public.profiles.terms_accepted_at IS 'Timestamp when user accepted Terms of Service and Privacy Policy. NULL means not yet accepted.';
