-- Add milestones table for tracking user achievements
CREATE TABLE IF NOT EXISTS public.milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  milestone_type text NOT NULL,
  achieved_at timestamptz DEFAULT now(),
  celebrated_at timestamptz,
  metadata jsonb,
  UNIQUE(user_id, milestone_type)
);

-- Enable RLS
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only access their own milestones
CREATE POLICY "Users can manage own milestones" ON public.milestones
  FOR ALL USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_milestones_user_id ON public.milestones(user_id);
CREATE INDEX IF NOT EXISTS idx_milestones_uncelebrated ON public.milestones(user_id) WHERE celebrated_at IS NULL;
