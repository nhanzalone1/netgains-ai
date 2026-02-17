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

  // Count workouts this week
  const weekAgo = new Date(effectiveDate);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().split('T')[0];
  const workoutsThisWeek = recentWorkouts.filter(w => w.date >= weekAgoStr && w.date <= todayStr).length;

  // Get last workout info
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
  const daysPerWeek = memoryMap.days_per_week || '4';

  // Determine if today should be a rest day based on training frequency
  const isLikelyRestDay = workoutsThisWeek >= parseInt(daysPerWeek) || daysSinceLastWorkout === 0;

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

  const prompt = `Generate a daily brief for a fitness app user. Keep it VERY short - 3 lines max total.

USER CONTEXT:
- Coaching mode: ${coachingMode} (${coachingMode === 'full' ? 'I build their program' : 'they have their own program'})
- Training split: ${trainingSplit}
- Days per week goal: ${daysPerWeek}
- Workouts this week: ${workoutsThisWeek}
- Days since last workout: ${daysSinceLastWorkout ?? 'never trained'}
- Last workout: ${lastWorkout ? `${lastWorkout.date} - ${lastWorkout.exercises.map(e => e.name).join(', ')}` : 'none'}
- Best recent lift to beat: ${targetExercise ? `${targetExercise} ${targetWeight}x${targetReps}` : 'none yet'}
- Protein goal: ${nutritionGoals.protein}g

LIKELY REST DAY: ${isLikelyRestDay}

OUTPUT FORMAT (respond with ONLY this JSON, no other text):
{
  "focus": "<workout type OR 'Rest Day' - keep under 15 chars>",
  "target": "<specific target to beat OR recovery message - under 50 chars>",
  "nutrition": "<protein goal reminder - under 25 chars>"
}

EXAMPLES:
For FULL mode training day: {"focus": "Push Day", "target": "Bench target: 230x5 (hit 225x5 last week)", "nutrition": "Protein goal: 200g"}
For ASSIST mode training day: {"focus": "Based on pattern: Pull", "target": "Last rows: 225x3 — go for 4", "nutrition": "Protein goal: 180g"}
For rest day: {"focus": "Rest Day", "target": "Great week — ${workoutsThisWeek} sessions done", "nutrition": "Eat at maintenance"}
For first-time user: {"focus": "Ready to Start", "target": "Log your first workout today", "nutrition": "Protein goal: ${nutritionGoals.protein}g"}`;

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

    return Response.json({
      status: 'generated',
      brief: {
        focus: brief.focus || 'Training Day',
        target: brief.target || 'Check in with your coach',
        nutrition: brief.nutrition || `Protein goal: ${nutritionGoals.protein}g`,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Daily brief generation error:', error);

    // Fallback brief
    return Response.json({
      status: 'generated',
      brief: {
        focus: isLikelyRestDay ? 'Rest Day' : 'Training Day',
        target: targetExercise ? `Beat: ${targetExercise} ${targetWeight}x${targetReps}` : 'Log a workout to get started',
        nutrition: `Protein goal: ${nutritionGoals.protein}g`,
      },
      generatedAt: new Date().toISOString(),
    });
  }
}
