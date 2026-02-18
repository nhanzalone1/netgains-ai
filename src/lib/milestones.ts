import { SupabaseClient } from '@supabase/supabase-js';
import { formatLocalDate } from './date-utils';

export interface Milestone {
  type: string;
  achieved_at: string;
  metadata?: Record<string, unknown>;
}

export interface MilestoneContext {
  newMilestones: Milestone[];  // Just achieved, not yet celebrated
  allMilestones: string[];     // All achieved milestone types
}

// All milestone types in priority order (highest first)
const MILESTONE_TYPES = [
  'first_pr',
  'streak_30',
  'streak_14',
  'streak_7',
  'streak_3',
  'workout_100',
  'workout_50',
  'first_workout',
  'first_food_entry',
] as const;

type MilestoneType = typeof MILESTONE_TYPES[number];

/**
 * Calculate the current workout streak.
 * A streak counts consecutive days with at least 1 workout.
 * Allows 1 rest day gap (Mon-Wed still counts if Tue was rest).
 */
function calculateStreak(workoutDates: string[], today: string): number {
  if (workoutDates.length === 0) return 0;

  // Create set of unique workout dates
  const workoutDays = new Set(workoutDates);

  // Parse today's date
  const todayDate = new Date(today + 'T12:00:00');

  let streak = 0;
  let restDaysUsed = 0;
  const currentDate = new Date(todayDate);

  // Walk backwards from today
  for (let i = 0; i < 60; i++) { // Max 60 days back
    const dateStr = formatLocalDate(currentDate);

    if (workoutDays.has(dateStr)) {
      streak++;
      restDaysUsed = 0;
    } else {
      restDaysUsed++;
      if (restDaysUsed > 1) {
        // Streak broken - more than 1 consecutive rest day
        break;
      }
    }

    // Move to previous day
    currentDate.setDate(currentDate.getDate() - 1);
  }

  return streak;
}

/**
 * Detect and record milestones for a user.
 * Returns newly achieved milestones that haven't been celebrated yet.
 */
export async function detectMilestones(
  supabase: SupabaseClient,
  userId: string,
  prDetected?: { exercise: string; weight: number; reps: number },
  effectiveDate?: string // YYYY-MM-DD from client, uses server time if not provided
): Promise<MilestoneContext> {
  const today = effectiveDate || formatLocalDate(new Date());

  // Get existing milestones
  const { data: existingMilestones } = await supabase
    .from('milestones')
    .select('milestone_type, celebrated_at')
    .eq('user_id', userId);

  const achieved = new Set((existingMilestones || []).map(m => m.milestone_type));
  const uncelebrated = (existingMilestones || [])
    .filter(m => m.celebrated_at === null)
    .map(m => m.milestone_type);

  // Get data needed for milestone detection
  const [workoutsResult, mealsResult, workoutDatesResult] = await Promise.all([
    // Total workout count
    supabase
      .from('workouts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
    // Total meals count
    supabase
      .from('meals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('consumed', true),
    // Workout dates for streak calculation (last 60 days)
    supabase
      .from('workouts')
      .select('date')
      .eq('user_id', userId)
      .gte('date', formatLocalDate(new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)))
      .order('date', { ascending: false }),
  ]);

  const workoutCount = workoutsResult.count || 0;
  const mealCount = mealsResult.count || 0;
  const workoutDates = (workoutDatesResult.data || []).map(w => w.date);
  const streak = calculateStreak(workoutDates, today);

  // Detect new milestones
  const newMilestones: Milestone[] = [];

  // First PR (passed in from chat route when detected)
  if (prDetected && !achieved.has('first_pr')) {
    newMilestones.push({
      type: 'first_pr',
      achieved_at: new Date().toISOString(),
      metadata: prDetected,
    });
  }

  // Streak milestones
  if (streak >= 30 && !achieved.has('streak_30')) {
    newMilestones.push({ type: 'streak_30', achieved_at: new Date().toISOString() });
  }
  if (streak >= 14 && !achieved.has('streak_14')) {
    newMilestones.push({ type: 'streak_14', achieved_at: new Date().toISOString() });
  }
  if (streak >= 7 && !achieved.has('streak_7')) {
    newMilestones.push({ type: 'streak_7', achieved_at: new Date().toISOString() });
  }
  if (streak >= 3 && !achieved.has('streak_3')) {
    newMilestones.push({ type: 'streak_3', achieved_at: new Date().toISOString() });
  }

  // Workout count milestones
  if (workoutCount >= 100 && !achieved.has('workout_100')) {
    newMilestones.push({ type: 'workout_100', achieved_at: new Date().toISOString() });
  }
  if (workoutCount >= 50 && !achieved.has('workout_50')) {
    newMilestones.push({ type: 'workout_50', achieved_at: new Date().toISOString() });
  }

  // First workout
  if (workoutCount >= 1 && !achieved.has('first_workout')) {
    newMilestones.push({ type: 'first_workout', achieved_at: new Date().toISOString() });
  }

  // First food entry
  if (mealCount >= 1 && !achieved.has('first_food_entry')) {
    newMilestones.push({ type: 'first_food_entry', achieved_at: new Date().toISOString() });
  }

  // Insert newly detected milestones
  if (newMilestones.length > 0) {
    const toInsert = newMilestones.map(m => ({
      user_id: userId,
      milestone_type: m.type,
      achieved_at: m.achieved_at,
      metadata: m.metadata || null,
    }));

    await supabase.from('milestones').upsert(toInsert, {
      onConflict: 'user_id,milestone_type',
      ignoreDuplicates: true,
    });
  }

  // Combine newly detected with previously uncelebrated
  const allUncelebrated = [
    ...newMilestones,
    ...uncelebrated
      .filter(type => !newMilestones.some(m => m.type === type))
      .map(type => ({ type, achieved_at: new Date().toISOString() })),
  ];

  // Sort by priority (first_pr first, then streaks, then counts, then firsts)
  allUncelebrated.sort((a, b) => {
    const aIndex = MILESTONE_TYPES.indexOf(a.type as MilestoneType);
    const bIndex = MILESTONE_TYPES.indexOf(b.type as MilestoneType);
    return aIndex - bIndex;
  });

  return {
    newMilestones: allUncelebrated,
    allMilestones: [...achieved, ...newMilestones.map(m => m.type)],
  };
}

/**
 * Mark milestones as celebrated after the coach has mentioned them.
 */
export async function markMilestonesCelebrated(
  supabase: SupabaseClient,
  userId: string,
  milestones: Milestone[]
): Promise<void> {
  if (milestones.length === 0) return;

  const types = milestones.map(m => m.type);

  await supabase
    .from('milestones')
    .update({ celebrated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .in('milestone_type', types);
}

/**
 * Format a milestone for display in the coach context.
 */
export function formatMilestone(milestone: Milestone): string {
  switch (milestone.type) {
    case 'first_workout':
      return '- FIRST WORKOUT COMPLETED: They just logged their very first workout ever. This is huge.';
    case 'first_food_entry':
      return '- FIRST FOOD LOGGED: They started tracking nutrition for the first time.';
    case 'streak_3':
      return '- 3-DAY STREAK: Three days in a row. Building momentum.';
    case 'streak_7':
      return '- 7-DAY STREAK: A full week without missing. Consistency is showing.';
    case 'streak_14':
      return '- 14-DAY STREAK: Two weeks straight. This is becoming a habit.';
    case 'streak_30':
      return '- 30-DAY STREAK: A full month of consistency. They\'re in the top tier.';
    case 'first_pr':
      const meta = milestone.metadata as { exercise?: string; weight?: number; reps?: number } | undefined;
      if (meta?.exercise) {
        return `- FIRST PR: New personal record on ${meta.exercise} — ${meta.weight}lbs x ${meta.reps}`;
      }
      return '- FIRST PR: They hit their first personal record.';
    case 'workout_50':
      return '- 50 WORKOUTS LOGGED: Fifty sessions in the books. Dedicated.';
    case 'workout_100':
      return '- 100 WORKOUTS LOGGED: One hundred workouts. Only 8% of users get here. Built different.';
    default:
      return `- ${milestone.type.toUpperCase()}: Achievement unlocked.`;
  }
}
