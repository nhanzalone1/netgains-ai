import { SupabaseClient } from '@supabase/supabase-js';
import { isGymSpecificEquipment } from '@/lib/supabase/types';

export interface PR {
  exercise: string;
  equipment: string;
  gym_id?: number | null;
  gym_name?: string;
  weight: number;
  reps: number;
  previousBest: { weight: number; reps: number } | null;
}

export interface WorkoutExercise {
  name: string;
  equipment: string;
  gym_id?: number | null;
  is_gym_specific?: boolean;
  sets: { weight: number; reps: number; variant?: string }[];
}

// Create a composite key for grouping PRs by name+equipment+gym (if gym-specific)
// Gym-specific equipment (machine, cable, smith) gets separated by gym
// Universal equipment (barbell, dumbbell, bodyweight, plate) is combined across all gyms
const getPRKey = (name: string, equipment: string, gymId?: number | null, isGymSpecific?: boolean): string => {
  const baseKey = `${name.toLowerCase()}::${equipment.toLowerCase()}`;
  // Only add gym suffix for gym-specific equipment with a valid gym_id
  if (isGymSpecific && gymId) {
    return `${baseKey}::gym_${gymId}`;
  }
  return baseKey;
};

// Compare weights with tolerance to handle floating-point precision issues
const weightsEqual = (a: number, b: number): boolean => {
  return Math.abs(a - b) < 0.01;
};

const weightGreater = (a: number, b: number): boolean => {
  return a > b + 0.01;
};

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
        if (!best || weightGreater(set.weight, best.weight) || (weightsEqual(set.weight, best.weight) && set.reps > best.reps)) {
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
          equipment: exercise.equipment,
          gym_id: exercise.gym_id,
          weight: best.weight,
          reps: best.reps,
          previousBest: null,
        });
      }
    }
    return prs;
  }

  const historicalWorkoutIds = historicalWorkouts.map(w => w.id);

  // Query historical exercises with equipment and gym info for proper grouping
  const { data: historicalExercises } = await supabase
    .from('exercises')
    .select('id, workout_id, name, equipment, gym_id, is_gym_specific')
    .in('workout_id', historicalWorkoutIds)
    .in('name', exerciseNames);

  if (!historicalExercises || historicalExercises.length === 0) {
    // Historical workouts exist but none have these exercises - all are PRs
    for (const exercise of exercises) {
      const best = getBestSet(exercise);
      if (best) {
        prs.push({
          exercise: exercise.name,
          equipment: exercise.equipment,
          gym_id: exercise.gym_id,
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

  // Build historical bests per exercise+equipment+gym (excluding warmup sets)
  // Key format: "name::equipment" for universal, "name::equipment::gym_X" for gym-specific
  const historicalBests: Record<string, { weight: number; reps: number }> = {};

  for (const exercise of historicalExercises) {
    const exerciseSets = (historicalSets || [])
      .filter(s => s.exercise_id === exercise.id && s.variant !== 'warmup');

    // Use gym-aware composite key
    const isGymSpecific = exercise.is_gym_specific ?? isGymSpecificEquipment(exercise.equipment || 'barbell');
    const key = getPRKey(exercise.name, exercise.equipment || 'barbell', exercise.gym_id, isGymSpecific);

    for (const set of exerciseSets) {
      const current = historicalBests[key];
      // Compare by weight first, then by reps at same weight (with tolerance for floating-point)
      if (!current || weightGreater(set.weight, current.weight) || (weightsEqual(set.weight, current.weight) && set.reps > current.reps)) {
        historicalBests[key] = { weight: set.weight, reps: set.reps };
      }
    }
  }

  // Check each exercise for PRs (using gym-aware composite key for lookup)
  for (const exercise of exercises) {
    const best = getBestSet(exercise);

    if (best) {
      // Use gym-aware key for gym-specific exercises
      const isGymSpecific = exercise.is_gym_specific ?? isGymSpecificEquipment(exercise.equipment);
      const key = getPRKey(exercise.name, exercise.equipment, exercise.gym_id, isGymSpecific);
      const historical = historicalBests[key];
      // It's a PR if no historical data OR current beat historical (with tolerance for floating-point)
      if (!historical || weightGreater(best.weight, historical.weight) ||
          (weightsEqual(best.weight, historical.weight) && best.reps > historical.reps)) {
        prs.push({
          exercise: exercise.name,
          equipment: exercise.equipment,
          gym_id: exercise.gym_id,
          weight: best.weight,
          reps: best.reps,
          previousBest: historical || null,
        });
      }
    }
  }

  return prs;
}
