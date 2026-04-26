-- Stripe subscription columns + beta_codes table for Cohort 1 migration.
-- Idempotent: safe to re-run.
--   - ADD COLUMN IF NOT EXISTS skips already-existing columns.
--   - CREATE TABLE IF NOT EXISTS skips if beta_codes is already created.
--   - ENABLE ROW LEVEL SECURITY is a no-op when RLS is already enabled.
--   - ON CONFLICT (code) DO NOTHING skips already-inserted founding codes.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS subscription_status text,
  ADD COLUMN IF NOT EXISTS subscription_price_id text,
  ADD COLUMN IF NOT EXISTS subscribed_at timestamptz,
  ADD COLUMN IF NOT EXISTS beta_code text;

CREATE TABLE IF NOT EXISTS beta_codes (
  code text PRIMARY KEY,
  cohort text NOT NULL DEFAULT 'cohort_1',
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS-locked: no policies = service role only. The webhook and
-- create-checkout-session route use SUPABASE_SERVICE_ROLE_KEY to bypass RLS.
-- No anon/authenticated SELECT — intentional, prevents code enumeration.
ALTER TABLE beta_codes ENABLE ROW LEVEL SECURITY;

INSERT INTO beta_codes (code) VALUES
  ('FOUNDING01'),('FOUNDING02'),('FOUNDING03'),('FOUNDING04'),('FOUNDING05'),
  ('FOUNDING06'),('FOUNDING07'),('FOUNDING08'),('FOUNDING09'),('FOUNDING10'),
  ('FOUNDING11'),('FOUNDING12'),('FOUNDING13'),('FOUNDING14'),('FOUNDING15')
ON CONFLICT (code) DO NOTHING;
