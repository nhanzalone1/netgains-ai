import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60;

const COACH_SYSTEM_PROMPT = `You are Coach, a strict, no-nonsense bodybuilding coach for the NetGains app. You are NOT a customer service bot. You are a real coach who expects commitment and delivers results.

## BOUNDARIES
You are a fitness and nutrition coach ONLY. Stay in your lane.

ALLOWED TOPICS:
- Training programming, exercise selection, form cues
- Nutrition, diet planning, macros, calories
- Supplements (protein, creatine, vitamins, pre-workout)
- Recovery, sleep, stress management as it relates to training
- Motivation and mindset for fitness goals
- Injury prevention and working around limitations
- Progress analysis based on their logged workouts

OFF-LIMITS — politely redirect:
- Medical diagnosis or treatment ("See a doctor for that")
- Mental health therapy ("That's above my pay grade — talk to a professional")
- Illegal substances, PEDs, steroids ("Not going there")
- Anything unrelated to fitness ("I'm your gym coach, not your life coach. What's your next workout?")

If someone asks off-topic questions, give ONE short redirect and bring it back to training. Example: "Can't help with that. But I can help you hit a PR. What are we training today?"

## YOUR PERSONALITY
- You're a real person, not an AI assistant. Talk like you're texting a friend who hired you to coach them.
- Short sentences. Casual punctuation. Skip the exclamation marks.
- Never say "Great question!" or "I'd be happy to help" or any corporate AI phrases.
- Don't over-explain. Say what needs to be said and stop.
- Use lowercase when it feels natural. You're not writing an email.
- Be direct but not robotic. Warm but not fake.
- You can be funny, give them shit when they slack, and celebrate when they show up.
- Sound like someone who's been in the gym for years and actually cares about their progress.

## ONBOARDING MODE
If the user hasn't completed onboarding (onboarding_complete is false or null), your FIRST priority is gathering their data through 6 quick questions.

### CRITICAL RULES FOR SMART ONBOARDING:

1. **CHECK BEFORE YOU ASK**: Before asking ANY onboarding question, review the memories you loaded from getMemories. If you already have the answer saved (e.g., you have "name" = "Noah"), DO NOT ask that question again. Skip it and move to the next unknown item.

2. **EXTRACT EVERYTHING**: When the user answers ANY question, extract ALL relevant information they mention — not just the direct answer. Examples:
   - User says "I'm Noah, 25 years old, 5'10 180lbs" → Save name="Noah" AND age="25" AND call updateUserProfile with height_inches=70 and weight_lbs=180
   - User says "I want to lose fat" → That's "cutting"
   - User says "I want to get bigger/gain muscle" → That's "bulking"

3. **SKIP ANSWERED QUESTIONS**: After saving memories, mentally check them against your remaining questions. If the user already answered a future question in a previous response, SKIP IT. Don't ask what you already know.

4. **CONVERSATIONAL FLOW**: The onboarding should feel like a conversation, not a form. Keep it moving fast.

5. **HANDLE INCOMPLETE ANSWERS**: If the user gives a partial answer, follow up for the missing info:
   - Q2: If they only give age but not height/weight, ask: "Got it. What's your height and weight?"
   - Q2: If they give age and height but not weight, ask: "And your current weight?"
   - Q4: If they give a vague answer like "get in shape" or "look better", clarify: "Got it — but specifically, are you trying to lose fat (cutting), gain size (bulking), or stay where you're at (maintaining)?"

### THE 6 ONBOARDING QUESTIONS (ask only what you don't already know):

1. Name — "what should i call you"
   NOTE: The app shows a greeting asking this. If user's first message looks like a name, that's the answer.

2. Stats — "age, height, weight?"
   (Extract all 3. Save age to memory, height/weight to profile. If they miss one, just ask for what's missing casually.)

3. Training schedule — "how many days a week can you realistically train"

4. Goal — "what's the goal right now — cutting, bulking, or maintaining"
   (If vague like "get fit", ask: "cool but specifically — trying to lose fat, gain size, or stay where you're at?")

5. Coaching mode — "do you want me to build your program or do you already have one you like"
   - BUILD IT → coaching_mode: "full"
   - OWN PROGRAM → coaching_mode: "assist"

6. Injuries — "any injuries i should know about"
   ("nope" or "none" is fine)

IMPORTANT: These are the ONLY 6 onboarding questions. Do NOT ask about:
- Coaching tone preferences
- Nutrition/diet (save for later)
- Calorie intake
- Food tracking methods
- Cardio routine
- Activity level/steps
- Sleep hours
- Supplements
- Pre-workout
These topics can be explored AFTER onboarding is complete, naturally through conversation.

When the user's first message comes in, they're likely responding with their name. Save it and move to the next question.

Save EACH answer immediately using saveMemory (e.g., key: "name", value: "Noah"). Also save height/weight/goal/coaching_mode to the profile using updateUserProfile.

## COMPLETING ONBOARDING
After question 6 is answered:
1. Save the final answer with saveMemory
2. Call updateUserProfile with onboarding_complete: true (and any other profile fields not yet saved)
3. Respond casually based on their coaching_mode:

**If coaching_mode is "full":**
Give them a quick summary of what you know (name, stats, goal, injuries if any), then ask about their experience level and what equipment they have access to. Keep it casual — you're just getting the last bits of info to build their program.

**If coaching_mode is "assist":**
Quick summary, acknowledge they've got their own thing going, tell them to log their next workout so you can take a look. Or they can ask you anything.

Don't use templates. Just talk to them like a person.

## APP TOUR (one-time only)
After completing onboarding AND delivering your first coaching response, check if app_tour_shown is false or null in the user profile. If so:
1. Call updateUserProfile with app_tour_shown: true
2. Add a quick rundown of where things are in the app — Log for workouts, Nutrition for food, Stats for progress, and you're always here in Coach. Keep it to 2-3 sentences max. Make it sound like you're just casually pointing things out, not giving a tutorial.

This tour message should appear ONCE, immediately after onboarding completes. Never show it again.

IMPORTANT: You MUST always include a text response after completing the tool calls. Never end your turn with only tool calls and no text.

## COACHING MODE
Once onboarded, you are their active coach:
- Check their recent lifts and maxes when relevant
- If they're cutting and strength drops 5%+, intervene immediately with volume/rep adjustments
- Push them to progressive overload
- Call out inconsistency if you see gaps in their training log

## TOOL USAGE
- ALWAYS call getUserProfile and getMemories first on every new conversation to check their onboarding status and load what you know about them
- ALWAYS call getCurrentWorkout to check if they have an active gym session. If active, it returns their exercises with weights, reps, and sets IN PROGRESS. This is the LIVE data from their current workout.
- getRecentLifts returns SAVED/COMPLETED workouts from the database (past sessions only)
- When analyzing strength trends, call both getRecentLifts and getMaxes
- Use updateUserProfile to save onboarding data
- Never guess about their data — always use the tools to look it up
- If a user mentions their current workout, today's session, or what they're doing now, call getCurrentWorkout
- If a user asks about past sessions or history, call getRecentLifts

## LONG-TERM MEMORY
- At the start of every conversation, call getMemories to load what you know about this user
- When the user shares important personal info, save it immediately with saveMemory
- Things to remember: age, schedule, goals, injuries, preferences, training split, weak points, PRs, sleep habits, diet approach, any coaching adjustments you've made
- Use descriptive keys like "age", "training_split", "left_shoulder_injury", "preferred_rep_range", "sleep_hours"
- Always check memories before giving advice so your coaching is consistent and personalized
- If a memory changes (e.g., new goal, weight update), save the updated value — it will overwrite the old one

## NUTRITION COACHING
You can help users with meal planning and tracking:

- When user asks for a meal plan, use addMealPlan to add each meal. Add all meals for the day with specific portions and macros.
- When user asks about their nutrition today, call getTodaysMeals first to see what they've eaten and what's planned.
- When analyzing their diet, compare consumed meals against their goals from getNutritionGoals.
- If user wants to change their calorie/macro targets, use updateNutritionGoals.
- Be specific with portions (e.g., "6oz chicken breast", "1 cup rice") and macros when creating meal plans.
- Consider their dietary preferences/restrictions from memory when suggesting foods.
- When creating a meal plan, add each meal using addMealPlan so it appears in their Nutrition tab.

Example meal plan response format:
"Here's your meal plan for today:

Breakfast: 3 eggs scrambled with spinach, 2 slices toast (450 cal, 28g protein)
Lunch: Grilled chicken breast 6oz with rice 1 cup and broccoli (550 cal, 45g protein)
Dinner: Salmon 5oz with sweet potato and asparagus (500 cal, 35g protein)
Snack: Greek yogurt with berries (200 cal, 15g protein)

Total: 1,700 cal, 123g protein

I've added these to your Nutrition tab. Tap each meal when you eat it."

## VOICE EXAMPLES
- "height and weight?"
- "185 at 5'10, got it. what's the goal right now"
- "your bench dropped 10 lbs in two weeks. that's not a plateau, that's a recovery issue. we're pulling back volume"
- "been 4 days. what's going on"
- "nice. 225 for 5 is solid. let's push for 6 next week"
- "yeah that's a good split. stick with it"
- "don't overthink it. eat protein, lift heavy, sleep. the rest is noise"

Never sound like a chatbot. No "certainly" or "absolutely" or "I understand." Just talk like a normal person who knows their stuff.`;

const tools: Anthropic.Tool[] = [
  {
    name: 'getUserProfile',
    description: 'Get the current user profile including height, weight, goal, onboarding status, and app_tour_shown',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'updateUserProfile',
    description: 'Update user profile with height, weight, goal, coaching_mode, onboarding status, and/or app_tour_shown',
    input_schema: {
      type: 'object',
      properties: {
        height_inches: { type: 'number', description: 'Height in total inches (e.g., 70 for 5\'10")' },
        weight_lbs: { type: 'number', description: 'Weight in pounds' },
        goal: { type: 'string', enum: ['cutting', 'bulking', 'maintaining'], description: 'User fitness goal - used for nutrition calculations' },
        coaching_mode: { type: 'string', enum: ['full', 'assist'], description: 'Coaching mode: full = coach builds program, assist = user has own program' },
        onboarding_complete: { type: 'boolean', description: 'Whether onboarding is finished' },
        app_tour_shown: { type: 'boolean', description: 'Whether the one-time app tour message has been shown' },
      },
      required: [],
    },
  },
  {
    name: 'getMaxes',
    description: 'Get user current 1RM values for squat, bench, deadlift, overhead press',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'getRecentLifts',
    description: 'Get recent workout history including exercises and sets',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of recent workouts to fetch (default 5)' },
      },
      required: [],
    },
  },
  {
    name: 'getCurrentWorkout',
    description: 'Get the user\'s in-progress workout that they are currently doing at the gym. Returns exercises and sets logged so far (not yet saved). Returns null if no workout is active.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'getMemories',
    description: 'Get all saved memories/facts about this user (age, injuries, preferences, schedule, etc.). Call this at the start of every conversation.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'saveMemory',
    description: 'Save a key-value fact about the user for long-term memory. If the key already exists, it will be updated. Use descriptive keys like "age", "training_split", "left_shoulder_injury".',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'A descriptive key for the memory (e.g., "age", "training_split", "injury_notes")' },
        value: { type: 'string', description: 'The value to store (e.g., "22", "push_pull_legs", "rotator cuff strain - avoid overhead")' },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'getTodaysMeals',
    description: 'Get all meals logged for a specific day including both planned (AI-generated) and consumed meals',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format, defaults to today' },
      },
      required: [],
    },
  },
  {
    name: 'getNutritionGoals',
    description: 'Get user daily nutrition targets (calories, protein, carbs, fat)',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'addMealPlan',
    description: 'Add a planned meal for the user (AI-generated meal plan). Use this when creating meal plans for the user.',
    input_schema: {
      type: 'object',
      properties: {
        meal_type: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'], description: 'Type of meal' },
        food_name: { type: 'string', description: 'Name of the food/meal' },
        calories: { type: 'number', description: 'Calories in the meal' },
        protein: { type: 'number', description: 'Protein in grams' },
        carbs: { type: 'number', description: 'Carbs in grams' },
        fat: { type: 'number', description: 'Fat in grams' },
        serving_size: { type: 'string', description: 'Serving size description (e.g., "6oz", "1 cup")' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format, defaults to today' },
      },
      required: ['meal_type', 'food_name', 'calories', 'protein', 'carbs', 'fat'],
    },
  },
  {
    name: 'updateNutritionGoals',
    description: 'Set or update user daily nutrition targets (calories, protein, carbs, fat)',
    input_schema: {
      type: 'object',
      properties: {
        calories: { type: 'number', description: 'Daily calorie target' },
        protein: { type: 'number', description: 'Daily protein target in grams' },
        carbs: { type: 'number', description: 'Daily carbs target in grams' },
        fat: { type: 'number', description: 'Daily fat target in grams' },
      },
      required: [],
    },
  },
];

// Prefix used by the client to signal a system trigger (hidden from UI)
const TRIGGER_PREFIX = '[SYSTEM_TRIGGER]';

export async function POST(req: Request) {
  const { messages, currentWorkout } = await req.json();

  // Get authenticated user
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const anthropic = new Anthropic();

  // Check if this is a system trigger (hidden message to generate opening)
  const isSystemTrigger = messages.length === 1 &&
    messages[0].role === 'user' &&
    messages[0].content.startsWith(TRIGGER_PREFIX);

  let anthropicMessages: Anthropic.MessageParam[];

  if (isSystemTrigger) {
    // Gather context for personalized opening
    const [profileResult, memoriesResult, workoutsResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('coach_memory').select('key, value').eq('user_id', user.id),
      supabase.from('workouts').select('id, date, notes').eq('user_id', user.id).order('date', { ascending: false }).limit(10),
    ]);

    const profile = profileResult.data;
    const memories = memoriesResult.data || [];
    const recentWorkouts = workoutsResult.data || [];

    // Get exercises for recent workouts
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

    // Calculate days since last workout
    const lastWorkoutDate = recentWorkouts[0]?.date;
    const daysSinceLastWorkout = lastWorkoutDate
      ? Math.floor((Date.now() - new Date(lastWorkoutDate).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Build context for opening generation
    const contextPrompt = `[DAILY OPENING - Generate a personalized greeting]

User Profile:
${JSON.stringify(profile, null, 2)}

User Memories (things you've learned about them):
${memories.map(m => `- ${m.key}: ${m.value}`).join('\n') || 'None yet'}

Recent Workouts (last 10):
${workoutDetails.length > 0 ? JSON.stringify(workoutDetails, null, 2) : 'No workouts logged yet'}

Days since last workout: ${daysSinceLastWorkout !== null ? daysSinceLastWorkout : 'Never logged'}
Today's date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}

INSTRUCTIONS:
Generate a casual opening message. Talk like a real person texting, not an AI.

1. IF onboarding_complete is false or null:
   - Start with something like "hey i'm your coach. let's get you set up — what should i call you"

2. IF onboarding complete AND daysSinceLastWorkout >= 2:
   - Casual check-in, reference their last session, no guilt trip. Something like "been a few days. ready to get back at it?"

3. IF onboarding complete AND it's a training day:
   - FULL MODE: What's on deck today, reference recent numbers, give them something to aim for
   - ASSIST MODE: Reference their pattern, mention a highlight from last session, suggest a target

4. IF onboarding complete AND it's a rest day:
   - Quick rest day acknowledgment, mention what they crushed last time

Keep it short. One or two sentences max. Use real numbers from their history. Sound like a friend who coaches, not a bot.`;

    anthropicMessages = [{ role: 'user', content: contextPrompt }];
  } else {
    // Normal message flow
    // Anthropic requires messages to start with user role and alternate
    // Filter out any system trigger messages that might be in the history
    const filteredMessages = messages.filter(
      (m: { role: string; content: string }) => !m.content.startsWith(TRIGGER_PREFIX)
    );

    const mappedMessages = filteredMessages.map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Fix message ordering if needed - if first message is assistant, prepend synthetic user
    if (mappedMessages.length > 0 && mappedMessages[0].role === 'assistant') {
      anthropicMessages = [
        { role: 'user' as const, content: '[User opened the coach tab]' },
        ...mappedMessages,
      ];
    } else {
      anthropicMessages = mappedMessages;
    }
  }

  // Tool execution helper — wrapped in try/catch so a single tool failure doesn't kill the whole request
  async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
    try {
    switch (name) {
      case 'getUserProfile': {
        const { data, error } = await supabase
          .from('profiles')
          .select('height_inches, weight_lbs, goal, coaching_mode, onboarding_complete, app_tour_shown, created_at')
          .eq('id', user.id)
          .single();
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify(data);
      }
      case 'updateUserProfile': {
        const updateData: Record<string, unknown> = {};
        if (input.height_inches !== undefined) updateData.height_inches = input.height_inches;
        if (input.weight_lbs !== undefined) updateData.weight_lbs = input.weight_lbs;
        if (input.goal !== undefined) updateData.goal = input.goal;
        if (input.coaching_mode !== undefined) updateData.coaching_mode = input.coaching_mode;
        if (input.onboarding_complete !== undefined) updateData.onboarding_complete = input.onboarding_complete;
        if (input.app_tour_shown !== undefined) updateData.app_tour_shown = input.app_tour_shown;

        const { error } = await supabase
          .from('profiles')
          .update(updateData)
          .eq('id', user.id);
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ success: true, updated: updateData });
      }
      case 'getMaxes': {
        const { data, error } = await supabase
          .from('maxes')
          .select('squat, bench, deadlift, overhead, updated_at')
          .eq('user_id', user.id)
          .single();
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify(data);
      }
      case 'getRecentLifts': {
        const limit = (input.limit as number) ?? 5;
        console.log(`[Coach] getRecentLifts called for user ${user.id}, limit=${limit}`);

        // Fetch workouts
        const { data: workouts, error } = await supabase
          .from('workouts')
          .select('id, date, notes')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .limit(limit);

        if (error) {
          console.error('[Coach] getRecentLifts error:', error);
          return JSON.stringify({ error: error.message });
        }

        if (!workouts || workouts.length === 0) {
          return JSON.stringify([]);
        }

        // Fetch exercises and sets for each workout
        const workoutIds = workouts.map((w) => w.id);
        console.log('[Coach] Fetching exercises for workout IDs:', workoutIds);
        const { data: exercises, error: exError } = await supabase
          .from('exercises')
          .select('id, workout_id, name, order_index')
          .in('workout_id', workoutIds)
          .order('order_index', { ascending: true });

        if (exError) {
          console.error('[Coach] Exercises query error:', exError);
        }
        console.log(`[Coach] Exercises query returned: ${exercises?.length ?? 0} exercises`, JSON.stringify(exercises));

        const exerciseIds = (exercises || []).map((e) => e.id);
        const { data: sets, error: setsError } = exerciseIds.length > 0
          ? await supabase
              .from('sets')
              .select('id, exercise_id, weight, reps, order_index')
              .in('exercise_id', exerciseIds)
              .order('order_index', { ascending: true })
          : { data: [], error: null };

        if (setsError) {
          console.error('[Coach] Sets query error:', setsError);
        }
        console.log(`[Coach] Sets query returned: ${sets?.length ?? 0} sets`);

        // Assemble the data
        const result = workouts.map((workout) => ({
          ...workout,
          exercises: (exercises || [])
            .filter((e) => e.workout_id === workout.id)
            .map((exercise) => ({
              name: exercise.name,
              sets: (sets || [])
                .filter((s) => s.exercise_id === exercise.id)
                .map((s) => ({ weight: s.weight, reps: s.reps })),
            })),
        }));

        console.log(`[Coach] getRecentLifts returned ${result.length} workouts`);
        if (result.length > 0) {
          console.log('[Coach] First workout:', JSON.stringify(result[0], null, 2));
        }
        return JSON.stringify(result);
      }
      case 'getCurrentWorkout': {
        if (!currentWorkout) return JSON.stringify({ active: false, message: 'No workout in progress' });
        return JSON.stringify({ active: true, workout: currentWorkout });
      }
      case 'getMemories': {
        const { data, error } = await supabase
          .from('coach_memory')
          .select('key, value, updated_at')
          .eq('user_id', user.id)
          .order('key', { ascending: true });
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify(data || []);
      }
      case 'saveMemory': {
        const key = input.key as string;
        const value = input.value as string;

        // Upsert: check if key exists, then update or insert
        const { data: existing } = await supabase
          .from('coach_memory')
          .select('id')
          .eq('user_id', user.id)
          .eq('key', key)
          .single();

        if (existing) {
          const { error } = await supabase
            .from('coach_memory')
            .update({ value })
            .eq('id', existing.id);
          if (error) return JSON.stringify({ error: error.message });
          return JSON.stringify({ success: true, action: 'updated', key, value });
        } else {
          const { error } = await supabase
            .from('coach_memory')
            .insert({ user_id: user.id, key, value });
          if (error) return JSON.stringify({ error: error.message });
          return JSON.stringify({ success: true, action: 'created', key, value });
        }
      }
      case 'getTodaysMeals': {
        const targetDate = (input.date as string) || new Date().toISOString().split('T')[0];
        const { data, error } = await supabase
          .from('meals')
          .select('*')
          .eq('user_id', user.id)
          .eq('date', targetDate)
          .order('meal_type');
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify(data || []);
      }
      case 'getNutritionGoals': {
        const { data, error } = await supabase
          .from('nutrition_goals')
          .select('*')
          .eq('user_id', user.id)
          .single();
        if (error) {
          // Return defaults if no goals set
          return JSON.stringify({ calories: 2000, protein: 150, carbs: 200, fat: 65 });
        }
        return JSON.stringify(data);
      }
      case 'addMealPlan': {
        const targetDate = (input.date as string) || new Date().toISOString().split('T')[0];
        const { error } = await supabase
          .from('meals')
          .insert({
            user_id: user.id,
            date: targetDate,
            meal_type: input.meal_type as string,
            food_name: input.food_name as string,
            calories: input.calories as number,
            protein: input.protein as number,
            carbs: input.carbs as number,
            fat: input.fat as number,
            serving_size: input.serving_size as string | null,
            ai_generated: true,
            consumed: false,
          });
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ success: true, message: `Added ${input.food_name} to ${input.meal_type}` });
      }
      case 'updateNutritionGoals': {
        const updates: Record<string, unknown> = {};
        if (input.calories !== undefined) updates.calories = input.calories;
        if (input.protein !== undefined) updates.protein = input.protein;
        if (input.carbs !== undefined) updates.carbs = input.carbs;
        if (input.fat !== undefined) updates.fat = input.fat;

        // Check if goals exist
        const { data: existing } = await supabase
          .from('nutrition_goals')
          .select('id')
          .eq('user_id', user.id)
          .single();

        if (existing) {
          const { error } = await supabase
            .from('nutrition_goals')
            .update(updates)
            .eq('user_id', user.id);
          if (error) return JSON.stringify({ error: error.message });
        } else {
          const { error } = await supabase
            .from('nutrition_goals')
            .insert({ user_id: user.id, ...updates });
          if (error) return JSON.stringify({ error: error.message });
        }
        return JSON.stringify({ success: true, updated: updates });
      }
      default:
        return JSON.stringify({ error: 'Unknown tool' });
    }
    } catch (err) {
      console.error(`[Coach] Tool "${name}" threw an error:`, err);
      return JSON.stringify({ error: `Tool ${name} failed: ${err instanceof Error ? err.message : 'unknown error'}` });
    }
  }

  // Create streaming response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        let currentMessages = [...anthropicMessages];
        let textStreamed = false;

        // Loop to handle tool calls (max 10 iterations to prevent infinite loops)
        const MAX_TOOL_ROUNDS = 10;
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            system: COACH_SYSTEM_PROMPT,
            messages: currentMessages,
            tools,
          });

          // Check if we need to handle tool use
          if (response.stop_reason === 'tool_use') {
            const assistantContent = response.content;

            // Add assistant message with tool use
            currentMessages.push({
              role: 'assistant',
              content: assistantContent,
            });

            // Process each tool use and collect results
            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            const toolErrors: string[] = [];
            for (const block of assistantContent) {
              if (block.type === 'tool_use') {
                const result = await executeTool(block.name, block.input as Record<string, unknown>);
                // Track errors for debugging
                if (result.includes('"error"')) {
                  toolErrors.push(`${block.name}: ${result}`);
                }
                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: result,
                });
              }
            }
            // Log tool errors for debugging
            if (toolErrors.length > 0) {
              console.error('[Coach] Tool errors:', toolErrors);
            }

            // Add tool results
            currentMessages.push({
              role: 'user',
              content: toolResults,
            });

            // Continue the loop to get the final response
            continue;
          }

          // Extract and stream text content
          for (const block of response.content) {
            if (block.type === 'text' && block.text.trim()) {
              const formatted = `0:${JSON.stringify(block.text)}\n`;
              controller.enqueue(encoder.encode(formatted));
              textStreamed = true;
            }
          }

          break;
        }

        // If no text was ever streamed, send a fallback
        if (!textStreamed) {
          const fallback = `0:${JSON.stringify("Coach got stuck on a database operation. Make sure all SQL migrations have been run (check for missing columns like coaching_mode, onboarding_complete, height_inches, weight_lbs, goal in profiles table).")}\n`;
          controller.enqueue(encoder.encode(fallback));
        }

        controller.close();
      } catch (error) {
        console.error('Chat error:', error);
        // Send error as text instead of crashing the stream
        const errorMsg = `0:${JSON.stringify("Coach is having a moment. Try sending that again.")}\n`;
        controller.enqueue(encoder.encode(errorMsg));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    },
  });
}
