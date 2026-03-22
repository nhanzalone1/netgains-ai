-- Fix RLS policy for profiles table to prevent users from modifying sensitive columns
-- This addresses the critical security vulnerability where users could self-assign admin status

-- Drop the existing overly permissive update policy
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Create a new restrictive update policy that prevents modification of sensitive columns
-- Users can update their own profile, but is_admin and consent_ai_data cannot be changed
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    -- Prevent users from modifying is_admin - it must remain unchanged
    is_admin IS NOT DISTINCT FROM (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
    -- Prevent users from modifying consent_ai_data once set to true
    -- (allows first-time consent but prevents revoking)
    AND (
      consent_ai_data IS NOT DISTINCT FROM (SELECT consent_ai_data FROM public.profiles WHERE id = auth.uid())
      OR (SELECT consent_ai_data FROM public.profiles WHERE id = auth.uid()) IS NULL
      OR (SELECT consent_ai_data FROM public.profiles WHERE id = auth.uid()) = false
    )
  );

-- Add a comment explaining the security rationale
COMMENT ON POLICY "Users can update own profile" ON public.profiles IS
  'Allows users to update their own profile fields except is_admin (which is admin-controlled) and consent_ai_data (which can only be set, not unset).';
