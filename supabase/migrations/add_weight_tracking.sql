-- Weight tracking table for body weight history
CREATE TABLE IF NOT EXISTS public.weigh_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weight_lbs numeric(5,1) NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

-- Index for efficient user queries
CREATE INDEX IF NOT EXISTS idx_weigh_ins_user_date ON public.weigh_ins(user_id, date DESC);

-- RLS policies
ALTER TABLE public.weigh_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own weigh-ins" ON public.weigh_ins
  FOR ALL USING (auth.uid() = user_id);
