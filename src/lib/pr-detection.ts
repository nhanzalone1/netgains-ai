import { SupabaseClient } from '@supabase/supabase-js';

export interface PR {
  exercise: string;
  weight: number;
  reps: number;
  previousBest: { weight: number; reps: number } | null;
}

export interface WorkoutExercise {
  name: string;
  sets: { weight: number; reps: number; variant?: string }[];
}

/**
 * Detect PRs from a workout by comparing to historical data.
 * Filters out warmup sets (variant === 'warmup') from PR consideration.
 * Compares by weight first, then reps at same weight.
 */
export async function detectPRs(
  supabase: SupabaseClient,
  userId: string,
  workoutDate: string,
  exercises: WorkoutExercise[]
): Promise<PR[]> {
  if (!exercises || exercises.length === 0) {
    return [];
  }

  const prs: PR[] = [];
  const exerciseNames = exercises.map(e => e.name);

  // Get best set from workout for an exercise (excluding warmup sets)
  const getBestSet = (exercise: WorkoutExercise) => {
    const workingSets = exercise.sets.filter(s => s.variant !== 'warmup');
    return workingSets.reduce(
      (best, set) => {
        if (!best || set.weight > best.weight || (set.weight === best.weight && set.reps > best.reps)) {
          return { weight: set.weight, reps: set.reps };
        }
        return best;
      },
      null as { weight: number; reps: number } | null
    );
  };

  // Query all workouts before this date that have these exercises
  const { data: historicalWorkouts } = await supabase
    .from('workouts')
    .select('id, date')
    .eq('user_id', userId)
    .lt('date', workoutDate)
    .order('date', { ascending: false });

  if (!historicalWorkouts || historicalWorkouts.length === 0) {
    // No historical workouts - everything is a PR
    for (const exercise of exercises) {
      const best = getBestSet(exercise);
      if (best) {
        prs.push({
          exercise: exercise.name,
          weight: best.weight,
          reps: best.reps,
          previousBest: null,
        });
      }
    }
    return prs;
  }

  const historicalWorkoutIds = historicalWorkouts.map(w => w.id);

  const { data: historicalExercises } = await supabase
    .from('exercises')
    .select('id, workout_id, name')
    .in('workout_id', historicalWorkoutIds)
    .in('name', exerciseNames);

  if (!historicalExercises || historicalExercises.length === 0) {
    // Historical workouts exist but none have these exercises - all are PRs
    for (const exercise of exercises) {
      const best = getBestSet(exercise);
      if (best) {
        prs.push({
          exercise: exercise.name,
          weight: best.weight,
          reps: best.reps,
          previousBest: null,
        });
      }
    }
    return prs;
  }

  const historicalExerciseIds = historicalExercises.map(e => e.id);

  const { data: historicalSets } = await supabase
    .from('sets')
    .select('exercise_id, weight, reps, variant')
    .in('exercise_id', historicalExerciseIds);

  // Build historical bests per exercise (excluding warmup sets)
  const historicalBests: Record<string, { weight: number; reps: number }> = {};

  for (const exercise of historicalExercises) {
    const exerciseSets = (historicalSets || [])
      .filter(s => s.exercise_id === exercise.id && s.variant !== 'warmup');
    for (const set of exerciseSets) {
      const current = historicalBests[exercise.name];
      // Compare by weight first, then by reps at same weight
      if (!current || set.weight > current.weight || (set.weight === current.weight && set.reps > current.reps)) {
        historicalBests[exercise.name] = { weight: set.weight, reps: set.reps };
      }
    }
  }

  // Check each exercise for PRs
  for (const exercise of exercises) {
    const best = getBestSet(exercise);

    if (best) {
      const historical = historicalBests[exercise.name];
      // It's a PR if no historical data OR current beat historical
      if (!historical || best.weight > historical.weight ||
          (best.weight === historical.weight && best.reps > historical.reps)) {
        prs.push({
          exercise: exercise.name,
          weight: best.weight,
          reps: best.reps,
          previousBest: historical || null,
        });
      }
    }
  }

  return prs;
}
