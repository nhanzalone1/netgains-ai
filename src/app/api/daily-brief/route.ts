import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { AI_MODELS, AI_TOKEN_LIMITS, DEFAULT_NUTRITION_GOALS } from '@/lib/constants';

export const maxDuration = 30;

// Cache version - increment this to invalidate all client caches
export const DAILY_BRIEF_VERSION = 4;

// Format date as YYYY-MM-DD in local time (not UTC)
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function POST(request: Request) {
  const supabase = await createClient();

  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse effective date from request (for debug override support)
  let effectiveDate = new Date();
  try {
    const body = await request.json();
    if (body.effectiveDate) {
      const parsed = new Date(body.effectiveDate + 'T12:00:00');
      if (!isNaN(parsed.getTime())) {
        effectiveDate = parsed;
      }
    }
  } catch {
    // No body or invalid JSON, use current date
  }

  const todayStr = formatLocalDate(effectiveDate);
  const yesterday = new Date(effectiveDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatLocalDate(yesterday);

  // Fetch all required data in parallel
  const [profileResult, memoriesResult, workoutsResult, nutritionGoalsResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('coach_memory').select('key, value').eq('user_id', user.id),
    supabase.from('workouts').select('id, date, notes').eq('user_id', user.id).order('date', { ascending: false }).limit(14),
    supabase.from('nutrition_goals').select('*').eq('user_id', user.id).single(),
  ]);

  // Log any query errors (don't fail the request, use defaults)
  if (profileResult.error) {
    console.error('[daily-brief] Profile query error:', profileResult.error);
  }
  if (memoriesResult.error) {
    console.error('[daily-brief] Memories query error:', memoriesResult.error);
  }
  if (workoutsResult.error) {
    console.error('[daily-brief] Workouts query error:', workoutsResult.error);
  }

  const profile = profileResult.data;
  const memories = memoriesResult.data || [];
  const recentWorkouts = workoutsResult.data || [];
  const nutritionGoals = nutritionGoalsResult.data || DEFAULT_NUTRITION_GOALS;

  // Check if onboarding is complete
  if (!profile?.onboarding_complete) {
    return Response.json({
      status: 'not_onboarded',
      generatedAt: new Date().toISOString(),
    });
  }

  // Get workout details with exercises and sets
  let workoutDetails: { date: string; exercises: { name: string; sets: { weight: number; reps: number }[] }[] }[] = [];
  if (recentWorkouts.length > 0) {
    const workoutIds = recentWorkouts.map(w => w.id);
    const { data: exercises } = await supabase
      .from('exercises')
      .select('id, workout_id, name')
      .in('workout_id', workoutIds);

    if (exercises && exercises.length > 0) {
      const exerciseIds = exercises.map(e => e.id);
      const { data: sets } = await supabase
        .from('sets')
        .select('exercise_id, weight, reps')
        .in('exercise_id', exerciseIds);

      workoutDetails = recentWorkouts.map(w => ({
        date: w.date,
        exercises: (exercises || [])
          .filter(e => e.workout_id === w.id)
          .map(e => ({
            name: e.name,
            sets: (sets || [])
              .filter(s => s.exercise_id === e.id)
              .map(s => ({ weight: s.weight, reps: s.reps }))
          }))
      }));
    }
  }

  // Count workouts this week (Monday through Sunday)
  const getMonday = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const monday = getMonday(effectiveDate);
  const mondayStr = formatLocalDate(monday);

  // Filter workouts to only those in current week (Monday through today)
  const workoutsInWeek = recentWorkouts.filter(w => w.date >= mondayStr && w.date <= todayStr);
  const workoutsThisWeek = workoutsInWeek.length;

  console.log('[daily-brief] Week count:', {
    mondayStr,
    todayStr,
    workoutsThisWeek,
    workoutsInWeekDates: workoutsInWeek.map(w => w.date),
    allRecentWorkoutDates: recentWorkouts.map(w => w.date),
  });

  // Check if user already worked out today
  const workedOutToday = recentWorkouts.some(w => w.date === todayStr);

  // Get last workout info (excluding today if they already worked out)
  const lastWorkout = workoutDetails[0];
  const daysSinceLastWorkout = lastWorkout
    ? Math.floor((effectiveDate.getTime() - new Date(lastWorkout.date + 'T12:00:00').getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Parse memories into object
  const memoryMap: Record<string, string> = {};
  memories.forEach(m => { memoryMap[m.key] = m.value; });

  // Build context for AI
  const coachingMode = profile.coaching_mode || 'assist';
  const trainingSplit = memoryMap.training_split || 'unknown';
  const daysPerWeek = parseInt(memoryMap.days_per_week || '4');

  // Parse split rotation from coach_memory (JSON array)
  // Format: ["Arms", "Legs", "Rest", "Chest and Front Delt", "Back and Rear Delt", "Rest"]
  let splitRotation: string[] = [];
  try {
    if (memoryMap.split_rotation) {
      splitRotation = JSON.parse(memoryMap.split_rotation);
    }
  } catch {
    // Invalid JSON, ignore
  }

  // Determine suggested workout based on split rotation
  let suggestedWorkout = 'Training Day';
  let lastWorkoutName = '';
  let rotationIndex = -1;

  // Get last workout name from notes field (stores folder/workout name)
  if (recentWorkouts.length > 0 && recentWorkouts[0].notes) {
    // Notes might be just the workout name, or "[DEBUG] something" - extract clean name
    lastWorkoutName = recentWorkouts[0].notes.replace(/^\[DEBUG\]\s*/, '').trim();
  }

  if (splitRotation.length > 0) {
    // Find where we are in the rotation by matching last workout name
    const normalizedLast = lastWorkoutName.toLowerCase();

    for (let i = 0; i < splitRotation.length; i++) {
      const day = splitRotation[i].toLowerCase();
      // Match if the workout name contains the split day name or vice versa
      if (normalizedLast.includes(day) || day.includes(normalizedLast) ||
          // Also match partial words (e.g., "arms" matches "Arms")
          normalizedLast.split(/\s+/).some(word => day.includes(word)) ||
          day.split(/\s+/).some(word => normalizedLast.includes(word))) {
        rotationIndex = i;
        break;
      }
    }

    // If found, suggest next in rotation
    if (rotationIndex >= 0) {
      const nextIndex = (rotationIndex + 1) % splitRotation.length;
      suggestedWorkout = splitRotation[nextIndex];
    } else if (lastWorkoutName) {
      // Couldn't match - just suggest first non-rest day
      suggestedWorkout = splitRotation.find(d => d.toLowerCase() !== 'rest') || splitRotation[0];
    } else {
      // No last workout - start from beginning
      suggestedWorkout = splitRotation[0];
    }
  } else {
    // No split rotation defined - fall back to exercise-based detection
    const detectWorkoutType = (exercises: { name: string }[]): string => {
      const names = exercises.map(e => e.name.toLowerCase()).join(' ');
      if (names.includes('bench') || names.includes('chest') || names.includes('fly') || names.includes('push')) return 'chest';
      if (names.includes('row') || names.includes('lat') || names.includes('pulldown') || names.includes('pull-up') || names.includes('pullup')) return 'back';
      if (names.includes('squat') || names.includes('leg') || names.includes('lunge') || names.includes('calf')) return 'legs';
      if (names.includes('shoulder') || names.includes('delt') || names.includes('lateral raise') || names.includes('ohp')) return 'shoulders';
      if (names.includes('curl') || names.includes('bicep') || names.includes('tricep') || names.includes('arm') || names.includes('pushdown')) return 'arms';
      if (names.includes('deadlift') || names.includes('rdl')) return 'back';
      return 'unknown';
    };

    const lastType = lastWorkout ? detectWorkoutType(lastWorkout.exercises) : 'unknown';
    const splitLower = trainingSplit.toLowerCase();

    if (splitLower.includes('push') || splitLower.includes('ppl')) {
      if (lastType === 'chest' || lastType === 'shoulders') suggestedWorkout = 'Pull Day';
      else if (lastType === 'back') suggestedWorkout = 'Leg Day';
      else if (lastType === 'legs') suggestedWorkout = 'Push Day';
      else suggestedWorkout = 'Push Day';
    } else if (splitLower.includes('upper') || splitLower.includes('lower')) {
      suggestedWorkout = (lastType === 'legs') ? 'Upper Body' : 'Lower Body';
    } else {
      if (lastType === 'chest') suggestedWorkout = 'Back Day';
      else if (lastType === 'back') suggestedWorkout = 'Shoulder Day';
      else if (lastType === 'shoulders') suggestedWorkout = 'Arm Day';
      else if (lastType === 'arms') suggestedWorkout = 'Leg Day';
      else if (lastType === 'legs') suggestedWorkout = 'Chest Day';
      else suggestedWorkout = 'Training Day';
    }
  }

  // Check if suggested workout is a rest day in the rotation
  const isRotationRestDay = suggestedWorkout.toLowerCase() === 'rest';

  // Log for debugging
  console.log('[daily-brief] Debug:', {
    trainingSplit,
    splitRotation,
    lastWorkoutName,
    rotationIndex,
    suggestedWorkout,
    isRotationRestDay,
    daysPerWeek,
    workoutsThisWeek,
    workedOutToday,
    lastWorkoutDate: lastWorkout?.date,
  });

  // Determine if today should be a rest day
  // Rest day if: already worked out today, OR hit weekly goal, OR need recovery (3+ consecutive days)
  const consecutiveWorkoutDays = (() => {
    let count = 0;
    const sortedWorkouts = [...recentWorkouts].sort((a, b) => b.date.localeCompare(a.date));
    let checkDate = new Date(effectiveDate);
    checkDate.setDate(checkDate.getDate() - 1); // Start from yesterday

    for (let i = 0; i < 7; i++) {
      const dateStr = formatLocalDate(checkDate);
      if (sortedWorkouts.some(w => w.date === dateStr)) {
        count++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
    return count;
  })();

  const needsRecovery = consecutiveWorkoutDays >= 3;
  const hitWeeklyGoal = workoutsThisWeek >= daysPerWeek;
  // Rest day if: rotation says rest, already trained today, hit weekly goal, or need recovery
  const isRestDay = isRotationRestDay || workedOutToday || hitWeeklyGoal || needsRecovery;

  // More detailed logging
  console.log('[daily-brief] Rest day check:', {
    workedOutToday,
    hitWeeklyGoal,
    needsRecovery,
    consecutiveWorkoutDays,
    isRestDay,
    todayStr,
    recentWorkoutDates: recentWorkouts.map(w => w.date),
  });

  // Find best recent performance for a "beat this" target
  // IMPORTANT: Target should match TODAY'S suggested workout, not last workout
  let targetExercise = '';
  let targetWeight = 0;
  let targetReps = 0;

  // Map muscle group keywords to exercise patterns
  const muscleGroupPatterns: Record<string, string[]> = {
    'arms': ['curl', 'bicep', 'tricep', 'pushdown', 'extension', 'hammer', 'preacher', 'skullcrusher'],
    'legs': ['squat', 'leg', 'lunge', 'calf', 'hamstring', 'quad', 'rdl', 'deadlift', 'press'],
    'chest': ['bench', 'chest', 'fly', 'flye', 'pec', 'incline', 'decline', 'dip'],
    'back': ['row', 'lat', 'pulldown', 'pull-up', 'pullup', 'chin-up', 'deadlift', 'shrug'],
    'shoulders': ['shoulder', 'delt', 'lateral', 'ohp', 'press', 'raise', 'face pull'],
    'push': ['bench', 'press', 'dip', 'fly', 'tricep', 'pushdown', 'shoulder'],
    'pull': ['row', 'lat', 'pulldown', 'pull-up', 'curl', 'bicep', 'face pull', 'deadlift'],
    'upper': ['bench', 'press', 'row', 'lat', 'curl', 'tricep', 'shoulder', 'delt'],
    'lower': ['squat', 'leg', 'lunge', 'calf', 'hamstring', 'quad', 'rdl', 'deadlift'],
    'full': ['squat', 'bench', 'deadlift', 'press', 'row'], // Compound focus for full body
  };

  // Find which muscle group today's workout targets
  const suggestedLower = suggestedWorkout.toLowerCase();
  let matchingPatterns: string[] = [];

  for (const [group, patterns] of Object.entries(muscleGroupPatterns)) {
    if (suggestedLower.includes(group)) {
      matchingPatterns = patterns;
      break;
    }
  }

  // Search ALL recent workouts for exercises matching today's muscle group
  if (matchingPatterns.length > 0 && workoutDetails.length > 0) {
    for (const workout of workoutDetails) {
      for (const exercise of workout.exercises) {
        const exerciseLower = exercise.name.toLowerCase();
        const matchesGroup = matchingPatterns.some(pattern => exerciseLower.includes(pattern));

        if (matchesGroup && exercise.sets.length > 0) {
          const bestSet = exercise.sets.reduce((best, set) =>
            set.weight > best.weight ? set : best, exercise.sets[0]);

          // Prioritize by weight (compound lifts will naturally be heavier)
          if (bestSet.weight > targetWeight) {
            targetExercise = exercise.name;
            targetWeight = bestSet.weight;
            targetReps = bestSet.reps;
          }
        }
      }
    }
  }

  // Fallback: if no matching exercise found, use heaviest compound from any recent workout
  if (!targetExercise && workoutDetails.length > 0) {
    const compoundLifts = ['bench', 'squat', 'deadlift', 'press', 'row'];
    for (const workout of workoutDetails) {
      for (const exercise of workout.exercises) {
        const isCompound = compoundLifts.some(c => exercise.name.toLowerCase().includes(c));
        if (isCompound && exercise.sets.length > 0) {
          const bestSet = exercise.sets.reduce((best, set) =>
            set.weight > best.weight ? set : best, exercise.sets[0]);
          if (bestSet.weight > targetWeight) {
            targetExercise = exercise.name;
            targetWeight = bestSet.weight;
            targetReps = bestSet.reps;
          }
        }
      }
    }
  }

  console.log('[daily-brief] Target exercise:', {
    suggestedWorkout,
    matchingPatterns: matchingPatterns.slice(0, 5),
    targetExercise,
    targetWeight,
    targetReps,
  });

  // Call Claude to generate the brief
  const anthropic = new Anthropic();

  const macroSummary = `${nutritionGoals.calories}cal | ${nutritionGoals.protein}P ${nutritionGoals.carbs}C ${nutritionGoals.fat}F`;

  // Build the prompt with clear training/rest day determination
  const restDayReason = isRotationRestDay ? 'scheduled rest in rotation' :
    workedOutToday ? 'already trained today' :
    hitWeeklyGoal ? `hit ${daysPerWeek}-day weekly goal` :
    needsRecovery ? `${consecutiveWorkoutDays} days straight, need recovery` : '';

  const prompt = `Generate a daily brief for a fitness app user. Keep it VERY short - 3 lines max total.

USER CONTEXT:
- Coaching mode: ${coachingMode} (${coachingMode === 'full' ? 'I build their program' : 'they have their own program'})
- Training split: ${trainingSplit}
- Days per week goal: ${daysPerWeek}
- Workouts this week: ${workoutsThisWeek}/${daysPerWeek}
- Days since last workout: ${daysSinceLastWorkout ?? 'never trained'}
- Last workout: ${lastWorkout ? `${lastWorkout.date} - ${lastWorkout.exercises.map(e => e.name).join(', ')}` : 'none'}
- Best recent lift to beat: ${targetExercise ? `${targetExercise} ${targetWeight}x${targetReps}` : 'none yet'}
- Daily macro goals: ${macroSummary}

TODAY'S STATUS: ${isRestDay ? `REST DAY (${restDayReason})` : `TRAINING DAY — suggested: ${suggestedWorkout}`}

IMPORTANT: Follow the TODAY'S STATUS above. If it says TRAINING DAY, do NOT output "Rest Day".

OUTPUT FORMAT (respond with ONLY this JSON, no other text):
{
  "focus": "<workout type OR 'Rest Day' - keep under 15 chars>",
  "target": "<specific target to beat OR recovery message - under 50 chars>",
  "nutrition": "<macro goals in format: Xcal | XP XC XF - under 30 chars>"
}

EXAMPLES:
For training day: {"focus": "${suggestedWorkout}", "target": "${targetExercise ? `Beat: ${targetExercise} ${targetWeight}x${targetReps}` : 'Time to train'}", "nutrition": "${macroSummary}"}
For rest day: {"focus": "Rest Day", "target": "Great week — ${workoutsThisWeek} sessions done", "nutrition": "${macroSummary}"}
For first-time user: {"focus": "Ready to Start", "target": "Log your first workout today", "nutrition": "${macroSummary}"}`;

  try {
    const response = await anthropic.messages.create({
      model: AI_MODELS.DAILY_BRIEF,
      max_tokens: AI_TOKEN_LIMITS.DAILY_BRIEF,
      messages: [{ role: 'user', content: prompt }],
    });

    // Extract text from response
    const textBlock = response.content.find(block => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text in response');
    }

    // Parse JSON from response
    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON in response');
    }

    const brief = JSON.parse(jsonMatch[0]);

    // Debug info to help troubleshoot
    const debugInfo = {
      mondayStr,
      todayStr,
      workoutsThisWeek,
      daysPerWeek,
      isRestDay,
      isRotationRestDay,
      workedOutToday,
      hitWeeklyGoal,
      needsRecovery,
      consecutiveWorkoutDays,
      recentWorkoutDates: recentWorkouts.map(w => w.date),
      splitRotation,
      lastWorkoutName,
      rotationIndex,
      suggestedWorkout,
    };

    return Response.json({
      status: 'generated',
      version: DAILY_BRIEF_VERSION,
      brief: {
        focus: brief.focus || 'Training Day',
        target: brief.target || 'Check in with your coach',
        // Always use actual macro goals, don't let AI make up numbers
        nutrition: macroSummary,
      },
      generatedAt: new Date().toISOString(),
      debug: debugInfo,
    });
  } catch (error) {
    console.error('Daily brief generation error:', error);

    // Debug info for fallback too
    const debugInfo = {
      mondayStr,
      todayStr,
      workoutsThisWeek,
      daysPerWeek,
      isRestDay,
      isRotationRestDay,
      workedOutToday,
      hitWeeklyGoal,
      needsRecovery,
      consecutiveWorkoutDays,
      recentWorkoutDates: recentWorkouts.map(w => w.date),
      splitRotation,
      lastWorkoutName,
      rotationIndex,
      suggestedWorkout,
      error: String(error),
    };

    // Fallback brief
    return Response.json({
      status: 'generated',
      version: DAILY_BRIEF_VERSION,
      brief: {
        focus: isRestDay ? 'Rest Day' : suggestedWorkout,
        target: isRestDay
          ? `${workoutsThisWeek} sessions this week — recover well`
          : (targetExercise ? `Beat: ${targetExercise} ${targetWeight}x${targetReps}` : 'Time to train'),
        nutrition: macroSummary,
      },
      generatedAt: new Date().toISOString(),
      debug: debugInfo,
    });
  }
}
