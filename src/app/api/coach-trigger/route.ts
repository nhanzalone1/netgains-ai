import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { formatLocalDate } from '@/lib/date-utils';
import { AI_MODELS, DEFAULT_NUTRITION_GOALS } from '@/lib/constants';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { isGymSpecificEquipment } from '@/lib/supabase/types';
import { logPREvents, type PRHitData } from '@/lib/coaching-events';

// Use Haiku for fast, cheap auto-triggers
const TRIGGER_MODEL = AI_MODELS.DAILY_BRIEF; // claude-3-haiku-20240307
const TRIGGER_MAX_TOKENS = 300;

export async function POST(req: Request) {
  console.log('[CoachTrigger API] Request received');

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    console.log('[CoachTrigger API] Auth failed:', authError?.message);
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit: 10 requests per minute per user
  const rateLimitResult = checkRateLimit(`coach_trigger_${user.id}`, RATE_LIMITS.AI_ENDPOINT);
  if (!rateLimitResult.success) {
    console.log('[CoachTrigger API] Rate limited:', user.id);
    return rateLimitResponse(rateLimitResult);
  }

  console.log('[CoachTrigger API] User authenticated:', user.id);

  const { triggerType, context } = await req.json();
  console.log('[CoachTrigger API] Trigger:', triggerType, 'Context:', context);

  if (!triggerType || !['meal_logged', 'workout_completed'].includes(triggerType)) {
    return Response.json({ error: 'Invalid trigger type' }, { status: 400 });
  }

  try {
    // Use client's local date for correct timezone handling, fallback to server date
    const today = context.localDate || formatLocalDate(new Date());
    console.log('[CoachTrigger API] Using date:', today, 'from client:', !!context.localDate);

    // Fetch user context in parallel (including recent conversation and today's workout)
    const [profileResult, memoriesResult, todayMealsResult, nutritionGoalsResult, recentMessagesResult, todayWorkoutResult, keyMemoriesResult] = await Promise.all([
      supabase.from('profiles').select('height_inches, weight_lbs, goal, coaching_intensity, key_memories').eq('id', user.id).maybeSingle(),
      supabase.from('coach_memory').select('key, value').eq('user_id', user.id),
      supabase.from('meals').select('food_name, calories, protein, carbs, fat, created_at').eq('user_id', user.id).eq('date', today).eq('consumed', true).limit(50),
      supabase.from('nutrition_goals').select('*').eq('user_id', user.id).maybeSingle(),
      // Fetch last 3 assistant messages for conversation context
      supabase.from('chat_messages').select('content, role').eq('user_id', user.id).eq('role', 'assistant').order('created_at', { ascending: false }).limit(3),
      // Check if user already worked out today
      supabase.from('workouts').select('id, notes, created_at').eq('user_id', user.id).eq('date', today).order('created_at', { ascending: false }).limit(1),
      // Fetch key_memories for cardio preferences
      supabase.from('profiles').select('key_memories').eq('id', user.id).maybeSingle(),
    ]);

    const profile = profileResult.data;
    const memories = memoriesResult.data || [];
    const todayMeals = todayMealsResult.data || [];
    const nutritionGoals = nutritionGoalsResult.data || DEFAULT_NUTRITION_GOALS;
    const recentMessages = recentMessagesResult.data || [];
    const todayWorkout = todayWorkoutResult.data?.[0] || null;
    const keyMemories = (profile?.key_memories || {}) as Record<string, string>;

    // Extract cardio preferences from key_memories
    const cardioPreferences = keyMemories.preferences?.toLowerCase().includes('cardio')
      ? keyMemories.preferences
      : null;

    // Determine if user already trained today
    const alreadyTrainedToday = !!todayWorkout;
    console.log('[CoachTrigger API] Already trained today:', alreadyTrainedToday, todayWorkout?.notes);

    // For workout_completed triggers, fetch exercise details and check for PRs
    // PRs are separated by: exercise name + equipment type + gym (for gym-specific equipment)
    const workoutExercises: { name: string; equipment: string; topSet?: { weight: number; reps: number } }[] = [];
    const prsHit: { exercise: string; equipment: string; weight: number; reps: number }[] = [];

    if (triggerType === 'workout_completed' && context.workoutId) {
      // Fetch exercises and sets for this workout (include gym info for PR tracking)
      const { data: exercises } = await supabase
        .from('exercises')
        .select('id, name, equipment, gym_id, is_gym_specific')
        .eq('workout_id', context.workoutId)
        .order('order_index', { ascending: true });

      if (exercises && exercises.length > 0) {
        // Fetch all sets for these exercises
        const exerciseIds = exercises.map(e => e.id);
        const { data: sets } = await supabase
          .from('sets')
          .select('exercise_id, weight, reps, variant')
          .in('exercise_id', exerciseIds)
          .neq('variant', 'warmup'); // Exclude warmup sets

        // Group sets by exercise and find top set (by estimated 1RM: weight * (1 + reps/30))
        const setsByExercise = new Map<string, { weight: number; reps: number; e1rm: number }[]>();
        for (const set of (sets || [])) {
          const e1rm = set.weight * (1 + set.reps / 30);
          if (!setsByExercise.has(set.exercise_id)) {
            setsByExercise.set(set.exercise_id, []);
          }
          setsByExercise.get(set.exercise_id)!.push({ weight: set.weight, reps: set.reps, e1rm });
        }

        // Build exercise list with top sets
        for (const ex of exercises) {
          const exSets = setsByExercise.get(ex.id) || [];
          const topSet = exSets.sort((a, b) => b.e1rm - a.e1rm)[0];
          workoutExercises.push({
            name: ex.name,
            equipment: ex.equipment || 'barbell',
            topSet: topSet ? { weight: topSet.weight, reps: topSet.reps } : undefined,
          });

          // Check if this is a PR (compare to previous best with gym-aware logic)
          if (topSet) {
            const isGymSpecific = ex.is_gym_specific ?? isGymSpecificEquipment(ex.equipment || 'barbell');

            // Build query for previous best - filter by name and equipment
            let query = supabase
              .from('sets')
              .select('weight, reps, exercises!inner(name, equipment, gym_id, is_gym_specific, workout_id)')
              .eq('exercises.name', ex.name)
              .eq('exercises.equipment', ex.equipment || 'barbell')
              .neq('exercises.workout_id', context.workoutId) // Exclude current workout
              .neq('variant', 'warmup')
              .order('weight', { ascending: false })
              .limit(20);

            // For gym-specific equipment, also filter by same gym
            if (isGymSpecific && ex.gym_id) {
              query = query.eq('exercises.gym_id', ex.gym_id);
            }

            const { data: previousBest } = await query;

            // Calculate best previous e1rm
            let bestPreviousE1rm = 0;
            for (const prev of (previousBest || [])) {
              const prevE1rm = prev.weight * (1 + prev.reps / 30);
              if (prevE1rm > bestPreviousE1rm) bestPreviousE1rm = prevE1rm;
            }

            // If current top set beats previous best, it's a PR
            if (topSet.e1rm > bestPreviousE1rm && bestPreviousE1rm > 0) {
              prsHit.push({ exercise: ex.name, equipment: ex.equipment || 'barbell', weight: topSet.weight, reps: topSet.reps });
            }
          }
        }
      }
      console.log('[CoachTrigger API] Workout exercises:', workoutExercises.length, 'PRs hit:', prsHit.length);

      // Log PR events for aggregate intelligence
      if (prsHit.length > 0) {
        const prEventData: PRHitData[] = prsHit.map((pr) => ({
          exercise: pr.exercise,
          equipment: pr.equipment,
          previous_best: null, // Previous best not tracked in current PR detection
          new_best: { weight: pr.weight, reps: pr.reps },
        }));

        logPREvents(user.id, prEventData).catch((err) => {
          console.error('[CoachingEvents] Failed to log pr_hit events:', err);
        });
      }
    }

    // Build recent conversation context (reversed to chronological order)
    const recentConversation = recentMessages.reverse().map(m => m.content).join('\n---\n');
    console.log('[CoachTrigger API] Recent messages:', recentMessages.length);

    // Calculate today's totals
    const todayTotals = todayMeals.reduce(
      (acc, meal) => ({
        calories: acc.calories + (meal.calories || 0),
        protein: acc.protein + (meal.protein || 0),
        carbs: acc.carbs + (meal.carbs || 0),
        fat: acc.fat + (meal.fat || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    console.log('[CoachTrigger API] Meals found:', todayMeals.length);
    console.log('[CoachTrigger API] Today totals:', todayTotals);
    console.log('[CoachTrigger API] Goals:', nutritionGoals);

    // Get user name from memories
    const userName = memories.find(m => m.key === 'name')?.value || 'there';
    const splitRotation = memories.find(m => m.key === 'split_rotation')?.value;
    const foodStaples = memories.find(m => m.key === 'food_staples')?.value;

    // Build the prompt based on trigger type
    let prompt: string;

    if (triggerType === 'meal_logged') {
      const remaining = {
        calories: nutritionGoals.calories - todayTotals.calories,
        protein: nutritionGoals.protein - todayTotals.protein,
      };

      // Determine time of day and protein status
      const hour = context.localHour ?? new Date().getHours();
      const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
      const isLateNight = hour >= 21 || hour < 5;
      const isEndOfDay = hour >= 19;
      const proteinHit = remaining.protein <= 0;
      const proteinShort = remaining.protein > 0;

      // Handle batched meals (array) or single meal (legacy)
      interface MealItem { mealName: string; calories: number; protein: number; carbs?: number; fat?: number }
      const meals: MealItem[] = context.meals || (context.mealName ? [{
        mealName: context.mealName,
        calories: context.calories || 0,
        protein: context.protein || 0,
      }] : []);

      const mealNames = meals.map(m => m.mealName).join(', ');
      const mealsSummary = meals.map(m => `${m.mealName}: ${m.calories} cal, ${m.protein}g protein`).join('\n');
      const totalLoggedProtein = meals.reduce((sum, m) => sum + (m.protein || 0), 0);
      const totalLoggedCalories = meals.reduce((sum, m) => sum + (m.calories || 0), 0);

      // Build response instruction based on state
      let responseInstruction: string;

      if (proteinHit && isLateNight) {
        // PROTEIN HIT + LATE NIGHT = Close the day, celebrate, no more food
        responseInstruction = `PROTEIN TARGET IS HIT. It's late night. CELEBRATE and CLOSE THE DAY.
Say something like: "Protein target locked in. Biological ledger is closed — your muscles have everything they need for overnight repair. Get to sleep."
DO NOT suggest eating more protein. DO NOT suggest any food. The day is done.`;
      } else if (proteinHit && isEndOfDay) {
        // PROTEIN HIT + END OF DAY = Close the day
        responseInstruction = `PROTEIN TARGET IS HIT. It's end of day. Close out the day positively.
${remaining.calories > 300 && profile?.goal === 'bulking' ? 'Optionally mention a small snack for calories only — NO protein push.' : 'Do not suggest more food.'}
End with: "biological ledger: protein target hit, muscles are fueled for recovery."`;
      } else if (proteinHit) {
        // PROTEIN HIT + EARLIER IN DAY = Acknowledge, move on
        responseInstruction = `PROTEIN TARGET IS HIT for today. Acknowledge this win.
Focus on the next meal timing and maintaining the lead. No need to push more protein — they've already hit it.`;
      } else if (proteinShort && isLateNight) {
        // PROTEIN SHORT + LATE NIGHT = Suggest specific protein snack
        responseInstruction = `PROTEIN IS SHORT by ${remaining.protein}g and it's late night.
Tell them exactly what to eat before bed to close the gap. Be specific: "${remaining.protein}g protein needed — [specific food from their staples]."
Then close the day.`;
      } else if (proteinShort && isEndOfDay) {
        // PROTEIN SHORT + END OF DAY = Push to close the gap
        responseInstruction = `PROTEIN IS SHORT by ${remaining.protein}g and it's end of day.
Tell them exactly what to eat to hit the target before bed. Be specific with grams needed.`;
      } else {
        // PROTEIN SHORT + EARLIER IN DAY = Context-aware guidance
        responseInstruction = `PROTEIN IS SHORT by ${remaining.protein}g — but READ THE RECENT CONVERSATION first.
If this was a PRE-WORKOUT meal, the next step is TRAINING, not more food. Say "fuel is loaded — go lift."
If coach mentioned a schedule (class, work, gym), follow that schedule for "next up."
Only suggest more food if it's clearly time for another meal AND coach didn't just set up a training window.`;
      }

      prompt = `You are Coach, an elite fitness trainer. The user just logged ${meals.length > 1 ? 'their meal' : 'a meal'}. Generate a SHORT (2-3 sentences max) directive.

CURRENT TIME: ${context.localTime || 'unknown'} (${timeOfDay})

USER: ${userName} | Goal: ${profile?.goal || 'not set'} | Weight: ${profile?.weight_lbs || '?'} lbs

TODAY'S TRAINING STATUS: ${alreadyTrainedToday ? `ALREADY TRAINED TODAY ✓ (${todayWorkout?.notes || 'workout logged'})` : 'NOT YET TRAINED'}
${alreadyTrainedToday ? '→ This meal is POST-WORKOUT. Focus on recovery and next meal timing.' : '→ Training still ahead. This could be pre-workout fuel.'}

${recentConversation ? `RECENT CONVERSATION (READ THIS CAREFULLY — this is what you just told them):
---
${recentConversation.substring(0, 1000)}
---
` : ''}
MEALS JUST LOGGED (${meals.length} item${meals.length > 1 ? 's' : ''}):
${mealsSummary}
Total just logged: ${totalLoggedCalories} cal, ${totalLoggedProtein}g protein

TODAY'S NUTRITION STATUS (after this meal):
- Consumed: ${todayTotals.calories} cal, ${todayTotals.protein}g protein
- Targets: ${nutritionGoals.calories} cal, ${nutritionGoals.protein}g protein
- Protein: ${proteinHit ? 'TARGET HIT ✓' : `${remaining.protein}g SHORT`}

${splitRotation ? `TRAINING SPLIT: ${splitRotation}` : ''}
${foodStaples ? `STAPLES: ${foodStaples}` : ''}

YOUR RESPONSE:
${responseInstruction}

RULES:
- Acknowledge the meal appropriately based on training status:
  - ALREADY TRAINED: "post-workout recovery fuel locked in" — next up is rest/next meal
  - NOT YET TRAINED: "pre-workout fuel loaded" — next up is training (or class then gym)
- NEVER say "time to hit the gym" if they ALREADY TRAINED TODAY
- If you recently suggested these exact foods, acknowledge: "you executed the plan"
- Read the recent conversation and STAY CONSISTENT with the plan
- ${profile?.goal === 'cutting' ? 'Cutting: NEVER suggest eating more calories.' : ''}
- Keep it punchy and direct. 2-3 sentences max.`;
    } else {
      // workout_completed
      const cardioLine = context.cardioNotes ? `\n- Cardio completed: ${context.cardioNotes}` : '';

      // Build exercise summary with top sets
      const exerciseSummary = workoutExercises.length > 0
        ? workoutExercises.map(ex =>
            ex.topSet ? `${ex.name}: ${ex.topSet.weight}lbs × ${ex.topSet.reps}` : ex.name
          ).join(', ')
        : (context.exerciseNames?.join(', ') || `${context.exerciseCount || 'Multiple'} exercises`);

      // Build PR callout (include equipment type if not barbell)
      const prSummary = prsHit.length > 0
        ? `\n\nPRs HIT THIS SESSION:\n${prsHit.map(pr => {
            const equipmentStr = pr.equipment !== 'barbell' ? ` (${pr.equipment})` : '';
            return `- ${pr.exercise}${equipmentStr}: ${pr.weight}lbs × ${pr.reps} (NEW PR!)`;
          }).join('\n')}`
        : '';

      // Build cardio recommendation based on key_memories
      const cardioRecommendation = cardioPreferences
        ? `\n\nUSER'S CARDIO PREFERENCES (from key_memories): ${cardioPreferences}\nUse these EXACT parameters when suggesting post-workout cardio.`
        : `\n\nNo cardio preferences saved yet. If suggesting cardio, ask for their preferred type (incline walk, stairmaster, etc.) and parameters (speed, incline, duration, heart rate zone) so you can save it.`;

      prompt = `You are Coach, an elite fitness trainer. The user just finished a workout. Generate a SHORT (3-4 sentences max) post-workout directive.

USER CONTEXT:
- Name: ${userName}
- Goal: ${profile?.goal || 'not set'}
- Weight: ${profile?.weight_lbs || '?'} lbs

WORKOUT COMPLETED:
- ${context.workoutName || 'Training session'}
- Exercises: ${exerciseSummary}${cardioLine}${prSummary}

TODAY'S NUTRITION SO FAR:
- Consumed: ${todayTotals.calories} cal, ${todayTotals.protein}g protein
- Goals: ${nutritionGoals.calories} cal, ${nutritionGoals.protein}g protein
${cardioRecommendation}
${foodStaples ? `\nUSER'S FOOD STAPLES: ${foodStaples}` : ''}
${splitRotation ? `SPLIT ROTATION: ${splitRotation}` : ''}

RULES:
1. React to the workout — reference specific exercises they did${prsHit.length > 0 ? '. CELEBRATE THE PR(S)!' : ''}
2. Tell them their post-workout window is open — give EXACT protein target (40-50g) and timing
3. ${profile?.goal === 'cutting' ? 'For cutting: suggest steady state cardio with EXACT parameters from their preferences (or ask for preferences if not saved)' : 'Keep cardio brief if bulking'}
4. End with: "next up: [specific recovery meal] — [biological reason]"
5. Keep it punchy and direct. This is a critical recovery moment.`;
    }

    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: TRIGGER_MODEL,
      max_tokens: TRIGGER_MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const coachMessage = textBlock && 'text' in textBlock ? textBlock.text : '';

    if (!coachMessage) {
      return Response.json({ error: 'No response generated' }, { status: 500 });
    }

    // Save the message to chat_messages table
    const { data: savedMessage, error: saveError } = await supabase
      .from('chat_messages')
      .insert({
        user_id: user.id,
        role: 'assistant',
        content: coachMessage,
        hidden: false,
      })
      .select('id')
      .single();

    if (saveError) {
      console.error('Failed to save coach message:', saveError);
      return Response.json({ error: 'Failed to save message' }, { status: 500 });
    }

    return Response.json({
      success: true,
      messageId: savedMessage.id,
      preview: coachMessage.substring(0, 100),
    });
  } catch (error) {
    console.error('Coach trigger error:', error);
    return Response.json({ error: 'Failed to generate response' }, { status: 500 });
  }
}
