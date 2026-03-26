-- Coaching events data collection infrastructure
-- Tracks user behavior events for aggregate coaching intelligence

-- coaching_events: individual behavior events
CREATE TABLE IF NOT EXISTS public.coaching_events (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'workout_completed',
    'meal_logged',
    'weight_recorded',
    'pr_hit',
    'plateau_detected',
    'goal_changed',
    'split_changed',
    'message_sent'
  )),
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_coaching_events_user_id ON public.coaching_events(user_id);
CREATE INDEX IF NOT EXISTS idx_coaching_events_user_created ON public.coaching_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coaching_events_type ON public.coaching_events(event_type);

-- Enable RLS
ALTER TABLE public.coaching_events ENABLE ROW LEVEL SECURITY;

-- Users can only read their own events
CREATE POLICY "Users can read own coaching events" ON public.coaching_events
  FOR SELECT USING (auth.uid() = user_id);

-- Service role has full access (for logging via admin client)
CREATE POLICY "Service role full access to coaching events" ON public.coaching_events
  FOR ALL USING (auth.role() = 'service_role');

-- weekly_snapshots: aggregated weekly metrics (table structure only, cron job added later)
CREATE TABLE IF NOT EXISTS public.weekly_snapshots (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  bodyweight numeric(5,1),
  avg_daily_calories numeric(6,1),
  avg_daily_protein numeric(5,1),
  workouts_completed integer DEFAULT 0,
  total_volume numeric(10,1) DEFAULT 0,
  prs_hit integer DEFAULT 0,
  adherence_score numeric(3,2),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, week_start)
);

-- Indexes for weekly_snapshots
CREATE INDEX IF NOT EXISTS idx_weekly_snapshots_user_id ON public.weekly_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_snapshots_user_week ON public.weekly_snapshots(user_id, week_start DESC);

-- Enable RLS
ALTER TABLE public.weekly_snapshots ENABLE ROW LEVEL SECURITY;

-- Users can only read their own snapshots
CREATE POLICY "Users can read own weekly snapshots" ON public.weekly_snapshots
  FOR SELECT USING (auth.uid() = user_id);

-- Service role has full access
CREATE POLICY "Service role full access to weekly snapshots" ON public.weekly_snapshots
  FOR ALL USING (auth.role() = 'service_role');

-- Comments for documentation
COMMENT ON TABLE public.coaching_events IS 'Tracks individual user behavior events for aggregate coaching intelligence';
COMMENT ON COLUMN public.coaching_events.event_type IS 'Type of event: workout_completed, meal_logged, weight_recorded, pr_hit, plateau_detected, goal_changed, split_changed, message_sent';
COMMENT ON COLUMN public.coaching_events.event_data IS 'Event-specific data (exercises, macros, weight, etc.)';
COMMENT ON COLUMN public.coaching_events.user_context IS 'User state at time of event (bodyweight, goal, intensity, training_frequency, weeks_on_goal, calorie_target)';

COMMENT ON TABLE public.weekly_snapshots IS 'Aggregated weekly metrics for trend analysis';
COMMENT ON COLUMN public.weekly_snapshots.adherence_score IS 'Days logged / 7 (0.00 to 1.00)';
COMMENT ON COLUMN public.weekly_snapshots.total_volume IS 'Sum of (sets * reps * weight) for the week';
