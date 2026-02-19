import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 30;

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

  const todayStr = effectiveDate.toISOString().split('T')[0];
  const yesterday = new Date(effectiveDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  // Fetch all required data in parallel
  const [profileResult, memoriesResult, workoutsResult, nutritionGoalsResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('coach_memory').select('key, value').eq('user_id', user.id),
    supabase.from('workouts').select('id, date, notes').eq('user_id', user.id).order('date', { ascending: false }).limit(14),
    supabase.from('nutrition_goals').select('*').eq('user_id', user.id).single(),
  ]);

  const profile = profileResult.data;
  const memories = memoriesResult.data || [];
  const recentWorkouts = workoutsResult.data || [];
  const nutritionGoals = nutritionGoalsResult.data || { calories: 2000, protein: 150, carbs: 200, fat: 65 };

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
  const mondayStr = monday.toISOString().split('T')[0];
  const workoutsThisWeek = recentWorkouts.filter(w => w.date >= mondayStr && w.date <= todayStr).length;

  console.log('[daily-brief] Week count:', { mondayStr, todayStr, workoutsThisWeek, recentWorkoutDates: recentWorkouts.map(w => w.date) });

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

  // Determine the suggested next workout based on split pattern
  let suggestedWorkout = 'Training Day';

  // Detect workout type from exercise names
  const detectWorkoutType = (exercises: { name: string }[]): string => {
    const names = exercises.map(e => e.name.toLowerCase()).join(' ');
    if (names.includes('bench') || names.includes('chest') || names.includes('fly') || names.includes('push')) return 'chest';
    if (names.includes('row') || names.includes('lat') || names.includes('pulldown') || names.includes('pull-up') || names.includes('pullup')) return 'back';
    if (names.includes('squat') || names.includes('leg') || names.includes('lunge') || names.includes('calf')) return 'legs';
    if (names.includes('shoulder') || names.includes('delt') || names.includes('lateral raise') || names.includes('ohp')) return 'shoulders';
    if (names.includes('curl') || names.includes('bicep') || names.includes('tricep') || names.includes('arm') || names.includes('pushdown')) return 'arms';
    if (names.includes('deadlift') || names.includes('rdl')) return 'back'; // Deadlifts often on back day
    return 'unknown';
  };

  // Detect last workout type
  const lastType = lastWorkout ? detectWorkoutType(lastWorkout.exercises) : 'unknown';

  // Suggest next workout based on split
  const splitLower = trainingSplit.toLowerCase();

  if (splitLower.includes('push') || splitLower.includes('ppl')) {
    // Push/Pull/Legs rotation
    if (lastType === 'chest' || lastType === 'shoulders') suggestedWorkout = 'Pull Day';
    else if (lastType === 'back') suggestedWorkout = 'Leg Day';
    else if (lastType === 'legs') suggestedWorkout = 'Push Day';
    else suggestedWorkout = 'Push Day';
  } else if (splitLower.includes('upper') || splitLower.includes('lower')) {
    // Upper/Lower rotation
    suggestedWorkout = (lastType === 'legs') ? 'Upper Body' : 'Lower Body';
  } else {
    // Body part split or unknown - suggest based on last workout type
    // Common body part rotation: Chest → Back → Shoulders → Arms → Legs
    if (lastType === 'chest') suggestedWorkout = 'Back Day';
    else if (lastType === 'back') suggestedWorkout = 'Shoulder Day';
    else if (lastType === 'shoulders') suggestedWorkout = 'Arm Day';
    else if (lastType === 'arms') suggestedWorkout = 'Leg Day';
    else if (lastType === 'legs') suggestedWorkout = 'Chest Day';
    else suggestedWorkout = 'Training Day';
  }

  // Log for debugging
  console.log('[daily-brief] Debug:', {
    trainingSplit,
    lastType,
    suggestedWorkout,
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
      const dateStr = checkDate.toISOString().split('T')[0];
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
  const isRestDay = workedOutToday || hitWeeklyGoal || needsRecovery;

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
  let targetExercise = '';
  let targetWeight = 0;
  let targetReps = 0;

  if (lastWorkout && lastWorkout.exercises.length > 0) {
    // Find the heaviest compound lift from last workout
    const compoundLifts = ['bench', 'squat', 'deadlift', 'press', 'row'];
    for (const exercise of lastWorkout.exercises) {
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
    // Fallback to first exercise if no compound found
    if (!targetExercise && lastWorkout.exercises[0].sets.length > 0) {
      const firstEx = lastWorkout.exercises[0];
      const bestSet = firstEx.sets.reduce((best, set) =>
        set.weight > best.weight ? set : best, firstEx.sets[0]);
      targetExercise = firstEx.name;
      targetWeight = bestSet.weight;
      targetReps = bestSet.reps;
    }
  }

  // Call Claude to generate the brief
  const anthropic = new Anthropic();

  const macroSummary = `${nutritionGoals.calories}cal | ${nutritionGoals.protein}P ${nutritionGoals.carbs}C ${nutritionGoals.fat}F`;

  // Build the prompt with clear training/rest day determination
  const restDayReason = workedOutToday ? 'already trained today' :
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
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
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
      workedOutToday,
      hitWeeklyGoal,
      needsRecovery,
      consecutiveWorkoutDays,
      recentWorkoutDates: recentWorkouts.map(w => w.date),
      lastType,
      suggestedWorkout,
    };

    return Response.json({
      status: 'generated',
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
      workedOutToday,
      hitWeeklyGoal,
      needsRecovery,
      consecutiveWorkoutDays,
      recentWorkoutDates: recentWorkouts.map(w => w.date),
      lastType,
      suggestedWorkout,
      error: String(error),
    };

    // Fallback brief
    return Response.json({
      status: 'generated',
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
