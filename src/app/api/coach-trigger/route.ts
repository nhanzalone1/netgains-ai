import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { formatLocalDate } from '@/lib/date-utils';
import { AI_MODELS, DEFAULT_NUTRITION_GOALS } from '@/lib/constants';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';

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
    const [profileResult, memoriesResult, todayMealsResult, nutritionGoalsResult, recentMessagesResult, todayWorkoutResult] = await Promise.all([
      supabase.from('profiles').select('height_inches, weight_lbs, goal, coaching_intensity').eq('id', user.id).maybeSingle(),
      supabase.from('coach_memory').select('key, value').eq('user_id', user.id),
      supabase.from('meals').select('food_name, calories, protein, carbs, fat, created_at').eq('user_id', user.id).eq('date', today).eq('consumed', true).limit(50),
      supabase.from('nutrition_goals').select('*').eq('user_id', user.id).maybeSingle(),
      // Fetch last 3 assistant messages for conversation context
      supabase.from('chat_messages').select('content, role').eq('user_id', user.id).eq('role', 'assistant').order('created_at', { ascending: false }).limit(3),
      // Check if user already worked out today
      supabase.from('workouts').select('id, notes, created_at').eq('user_id', user.id).eq('date', today).order('created_at', { ascending: false }).limit(1),
    ]);

    const profile = profileResult.data;
    const memories = memoriesResult.data || [];
    const todayMeals = todayMealsResult.data || [];
    const nutritionGoals = nutritionGoalsResult.data || DEFAULT_NUTRITION_GOALS;
    const recentMessages = recentMessagesResult.data || [];
    const todayWorkout = todayWorkoutResult.data?.[0] || null;

    // Determine if user already trained today
    const alreadyTrainedToday = !!todayWorkout;
    console.log('[CoachTrigger API] Already trained today:', alreadyTrainedToday, todayWorkout?.notes);

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
      const cardioLine = context.cardioNotes ? `\n- Cardio: ${context.cardioNotes}` : '';
      prompt = `You are Coach, an elite fitness trainer. The user just finished a workout. Generate a SHORT (2-3 sentences max) post-workout directive.

USER CONTEXT:
- Name: ${userName}
- Goal: ${profile?.goal || 'not set'}
- Weight: ${profile?.weight_lbs || '?'} lbs

WORKOUT COMPLETED:
- ${context.workoutName || 'Training session'}
- ${context.exerciseCount || 'Multiple'} exercises${cardioLine}

TODAY'S NUTRITION SO FAR:
- Consumed: ${todayTotals.calories} cal, ${todayTotals.protein}g protein
- Goals: ${nutritionGoals.calories} cal, ${nutritionGoals.protein}g protein

${foodStaples ? `USER'S FOOD STAPLES: ${foodStaples}` : ''}
${splitRotation ? `SPLIT ROTATION: ${splitRotation}` : ''}

RULES:
1. React to the workout completion (one short line)${context.cardioNotes ? ' — acknowledge the cardio they did' : ''}
2. Tell them their post-workout window is open — give EXACT protein target (40-50g) and timing
3. End with: "next up: [specific recovery meal] — [biological reason]"
4. Keep it punchy and direct. This is a critical recovery moment.`;
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
