-- Fix day-one bug: handle_new_user() never copied email from auth.users to
-- profiles.email. As of 2026-04-29, 15/16 profiles have profiles.email = NULL.
-- Auth flows read auth.users.email so the bug is silent today, but live-mode
-- launch needs profiles.email populated for marketing/admin/email-service joins.
--
-- This migration:
--   (1) Updates handle_new_user() to copy NEW.email on insert.
--   (2) Backfills the 15 existing NULL rows from auth.users.
--   (3) Documents the policy: auth.users.email is source of truth; profiles.email
--       is a denormalized cache, refreshed only on signup. No UPDATE trigger —
--       email changes via Supabase Auth will NOT propagate. Code requiring
--       guaranteed-current email must join auth.users.

-- (1) Trigger function: write email alongside id on signup.
-- SET search_path pre-empts the Supabase linter warning on SECURITY DEFINER
-- functions; risk is near-zero here (no unqualified references) but explicit
-- is better.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

-- Trigger on_auth_user_created already points at this function and does not
-- need recreation.

-- (2) Backfill existing NULL emails. Idempotent — re-running is a no-op
-- because the WHERE filter excludes already-populated rows.
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND p.email IS NULL;

-- (3) Document source-of-truth policy on the column.
COMMENT ON COLUMN public.profiles.email IS
  'Denormalized copy of auth.users.email, populated on signup by handle_new_user(). '
  'Source of truth is auth.users.email — profiles.email may go stale if a user '
  'changes their email via Supabase Auth (no UPDATE trigger). Code requiring '
  'guaranteed-current email must join auth.users.';
