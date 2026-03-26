// Coaching events logging system
// Captures user behavior for aggregate coaching intelligence

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Service role client for bypassing RLS
function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Event types
export type CoachingEventType =
  | 'workout_completed'
  | 'meal_logged'
  | 'weight_recorded'
  | 'pr_hit'
  | 'plateau_detected'
  | 'goal_changed'
  | 'split_changed'
  | 'message_sent';

// User context attached to every event
export interface UserContext {
  bodyweight: number | null;
  goal: string | null;
  goal_intensity: string | null;
  training_frequency: number | null;
  weeks_since_goal_set: number | null;
  daily_calorie_target: number | null;
}

// Event data types
export interface WorkoutCompletedData {
  exercises: Array<{
    name: string;
    equipment: string;
    sets: Array<{ weight: number; reps: number; variant?: string }>;
  }>;
  total_volume: number;
  duration_minutes?: number;
  folder_name: string | null;
  location_name: string | null;
  cardio_notes?: string;
}

export interface MealLoggedData {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  food_name: string;
  meal_type: string;
}

export interface WeightRecordedData {
  weight: number;
  previous_weight: number | null;
  change: number | null;
}

export interface PRHitData {
  exercise: string;
  equipment: string;
  gym_id?: number | null;
  previous_best: { weight: number; reps: number } | null;
  new_best: { weight: number; reps: number };
  improvement_percent?: number;
}

export interface GoalChangedData {
  old_goal: string | null;
  new_goal: string;
  intensity: string | null;
}

export interface SplitChangedData {
  old_split: string[];
  new_split: string[];
}

export interface MessageSentData {
  message_classification: 'simple' | 'complex';
  model_used: 'haiku' | 'sonnet';
  user_tier: 'free' | 'basic' | 'premium';
  response_tokens: number;
}

// Union type for all event data
export type EventData =
  | WorkoutCompletedData
  | MealLoggedData
  | WeightRecordedData
  | PRHitData
  | GoalChangedData
  | SplitChangedData
  | MessageSentData
  | Record<string, unknown>;

/**
 * Fetch user context for event logging
 */
async function fetchUserContext(userId: string): Promise<UserContext> {
  const adminClient = getSupabaseAdmin();

  const [profileResult, goalsResult, splitResult] = await Promise.all([
    adminClient
      .from('profiles')
      .select('weight_lbs, goal, coaching_intensity, updated_at')
      .eq('id', userId)
      .maybeSingle(),
    adminClient
      .from('nutrition_goals')
      .select('calories')
      .eq('user_id', userId)
      .maybeSingle(),
    adminClient
      .from('coach_memory')
      .select('value')
      .eq('user_id', userId)
      .eq('key', 'split_rotation')
      .maybeSingle(),
  ]);

  const profile = profileResult.data;
  const goals = goalsResult.data;
  const splitRotation = splitResult.data?.value;

  // Calculate training frequency from split rotation
  let trainingFrequency: number | null = null;
  if (splitRotation) {
    try {
      const parsed = JSON.parse(splitRotation);
      if (Array.isArray(parsed)) {
        trainingFrequency = parsed.length;
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Calculate weeks since profile was last updated (proxy for goal change)
  let weeksSinceGoalSet: number | null = null;
  if (profile?.updated_at) {
    const updatedAt = new Date(profile.updated_at);
    const now = new Date();
    const diffMs = now.getTime() - updatedAt.getTime();
    weeksSinceGoalSet = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  }

  return {
    bodyweight: profile?.weight_lbs ?? null,
    goal: profile?.goal ?? null,
    goal_intensity: profile?.coaching_intensity ?? null,
    training_frequency: trainingFrequency,
    weeks_since_goal_set: weeksSinceGoalSet,
    daily_calorie_target: goals?.calories ?? null,
  };
}

/**
 * Log a coaching event with auto-populated user context
 * Uses admin client to bypass RLS
 */
export async function logCoachingEvent(
  userId: string,
  eventType: CoachingEventType,
  eventData: EventData
): Promise<{ success: boolean; error?: string }> {
  try {
    const adminClient = getSupabaseAdmin();
    const userContext = await fetchUserContext(userId);

    const { error } = await adminClient.from('coaching_events').insert({
      user_id: userId,
      event_type: eventType,
      event_data: eventData,
      user_context: userContext,
    });

    if (error) {
      console.error('[CoachingEvents] Insert error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('[CoachingEvents] Unexpected error:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Log multiple PR events from a single workout (batch insert)
 */
export async function logPREvents(
  userId: string,
  prs: PRHitData[]
): Promise<{ success: boolean; error?: string }> {
  if (prs.length === 0) {
    return { success: true };
  }

  try {
    const adminClient = getSupabaseAdmin();
    const userContext = await fetchUserContext(userId);

    const events = prs.map((pr) => ({
      user_id: userId,
      event_type: 'pr_hit' as const,
      event_data: pr,
      user_context: userContext,
    }));

    const { error } = await adminClient.from('coaching_events').insert(events);

    if (error) {
      console.error('[CoachingEvents] PR batch insert error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('[CoachingEvents] PR batch unexpected error:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Calculate total volume from exercises
 * Volume = sum of (weight * reps) for all working sets (excludes warmup)
 */
export function calculateTotalVolume(
  exercises: Array<{
    sets: Array<{ weight: number; reps: number; variant?: string }>;
  }>
): number {
  let totalVolume = 0;
  for (const exercise of exercises) {
    for (const set of exercise.sets) {
      if (set.variant !== 'warmup') {
        totalVolume += set.weight * set.reps;
      }
    }
  }
  return totalVolume;
}
