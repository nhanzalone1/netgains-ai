import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { formatLocalDate } from '@/lib/date-utils';
import { AI_MODELS, DEFAULT_NUTRITION_GOALS } from '@/lib/constants';

// Use Haiku for fast, cheap auto-triggers
const TRIGGER_MODEL = AI_MODELS.DAILY_BRIEF; // claude-3-haiku-20240307
const TRIGGER_MAX_TOKENS = 300;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { triggerType, context } = await req.json();

  if (!triggerType || !['meal_logged', 'workout_completed'].includes(triggerType)) {
    return Response.json({ error: 'Invalid trigger type' }, { status: 400 });
  }

  try {
    const today = formatLocalDate(new Date());

    // Fetch user context in parallel
    const [profileResult, memoriesResult, todayMealsResult, nutritionGoalsResult] = await Promise.all([
      supabase.from('profiles').select('height_inches, weight_lbs, goal, coaching_intensity').eq('id', user.id).single(),
      supabase.from('coach_memory').select('key, value').eq('user_id', user.id),
      supabase.from('meals').select('food_name, calories, protein, carbs, fat').eq('user_id', user.id).eq('date', today).eq('consumed', true),
      supabase.from('nutrition_goals').select('*').eq('user_id', user.id).single(),
    ]);

    const profile = profileResult.data;
    const memories = memoriesResult.data || [];
    const todayMeals = todayMealsResult.data || [];
    const nutritionGoals = nutritionGoalsResult.data || DEFAULT_NUTRITION_GOALS;

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

      prompt = `You are Coach, an elite fitness trainer. The user just logged a meal. Generate a SHORT (2-3 sentences max) "next up" directive.

USER CONTEXT:
- Name: ${userName}
- Goal: ${profile?.goal || 'not set'}
- Weight: ${profile?.weight_lbs || '?'} lbs

MEAL JUST LOGGED:
- ${context.mealName}: ${context.calories} cal, ${context.protein}g protein

TODAY'S PROGRESS:
- Consumed: ${todayTotals.calories} cal, ${todayTotals.protein}g protein
- Goals: ${nutritionGoals.calories} cal, ${nutritionGoals.protein}g protein
- Remaining: ${remaining.calories} cal, ${remaining.protein}g protein

${foodStaples ? `USER'S FOOD STAPLES: ${foodStaples}` : ''}

RULES:
1. Start with ONE line acknowledging the meal with biological context
2. Tell them exactly what's next: when to eat, what to focus on (protein targets)
3. End with: "next up: [specific food/action] — [why it matters]"
4. If ${profile?.goal === 'cutting' ? 'cutting: do NOT tell them to eat more calories. Only mention protein if short.' : 'bulking: encourage hitting calorie targets.'}
5. Keep it punchy and direct. No fluff.`;
    } else {
      // workout_completed
      prompt = `You are Coach, an elite fitness trainer. The user just finished a workout. Generate a SHORT (2-3 sentences max) post-workout directive.

USER CONTEXT:
- Name: ${userName}
- Goal: ${profile?.goal || 'not set'}
- Weight: ${profile?.weight_lbs || '?'} lbs

WORKOUT COMPLETED:
- ${context.workoutName || 'Training session'}
- ${context.exerciseCount || 'Multiple'} exercises

TODAY'S NUTRITION SO FAR:
- Consumed: ${todayTotals.calories} cal, ${todayTotals.protein}g protein
- Goals: ${nutritionGoals.calories} cal, ${nutritionGoals.protein}g protein

${foodStaples ? `USER'S FOOD STAPLES: ${foodStaples}` : ''}
${splitRotation ? `SPLIT ROTATION: ${splitRotation}` : ''}

RULES:
1. React to the workout completion (one short line)
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
