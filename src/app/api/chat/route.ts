import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { detectMilestones, markMilestonesCelebrated, formatMilestone, MilestoneContext } from '@/lib/milestones';
import { formatLocalDate } from '@/lib/date-utils';
import { AI_MODELS, AI_TOKEN_LIMITS, RATE_LIMITS, DEFAULT_NUTRITION_GOALS } from '@/lib/constants';

export const maxDuration = 60;

// Dynamic system prompt - shorter for onboarded users
function getSystemPrompt(isOnboarded: boolean): string {
  const basePrompt = `You are Coach, a no-nonsense fitness coach for NetGains. Talk like you're texting a friend — short sentences, lowercase, no corporate phrases like "Great question!" or "I'd be happy to help."

BOUNDARIES: Fitness/nutrition only. Redirect off-topic: "Can't help with that. What's your next workout?"

RESPONSE LENGTH: 2-3 sentences default. Longer only for "how/why" questions or meal plans.

VOICE: "height and weight?" / "185 at 5'10, got it. what's the goal" / "been 4 days. what's going on" / "nice. 225x5 is solid. push for 6 next week"`;

  if (!isOnboarded) {
    return basePrompt + `

ONBOARDING (if onboarding_complete is false):

FIRST MESSAGE (welcome):
"i'm your ai coach. i'll track your workouts, nutrition, and help you hit your goals. let's get you set up — what should i call you?"

Then gather info through 6 more questions. Check getMemories first — skip questions you already know.

DO NOT ask about: maxes, 1RMs, PRs, or current lift numbers. We'll learn those as they log workouts.

Questions (ask what's missing):
1. Name → saveMemory key:"name"
2. Age/height/weight (ask together) → saveMemory "age", updateUserProfile height_inches/weight_lbs
3. Goal → updateUserProfile goal:"cutting"|"bulking"|"maintaining"
4. Coaching mode → "do you have your own program or want me to build one?" → updateUserProfile coaching_mode:"full"|"assist"
5. Split → "what's your split?" → save BOTH keys:
   - saveMemory key:"training_split" value:"PPL" (or "Upper/Lower", "Bro Split", etc.)
   - saveMemory key:"split_rotation" value:'["Push","Pull","Legs","Rest","Push","Pull","Legs"]'
6. Injuries → saveMemory "injuries" (if none, save "none")

SPLIT PRESETS (use these exact JSON arrays for split_rotation):
- PPL: '["Push","Pull","Legs","Rest","Push","Pull","Legs"]'
- Upper/Lower: '["Upper","Lower","Rest","Upper","Lower","Rest"]'
- Bro: '["Chest","Back","Shoulders","Arms","Legs","Rest","Rest"]'
- Full Body: '["Full Body","Rest","Full Body","Rest","Full Body","Rest"]'

AFTER ALL QUESTIONS — do these tool calls, then give the closing message:
1. updateUserProfile onboarding_complete:true
2. Respond with EXACTLY this structure:
   "you're all set. here's what i've got: [age], [height/weight], [goal], [split]. [mention injuries if not "none"].

   bottom nav: Log for workouts, Nutrition for meals, Stats for your PRs, and Coach is me. tap Log and hit + to start your first workout. tap Nutrition to set up your meal targets.

   you're one of the first people using netgains — if anything's confusing, broken, or you have ideas, tell noah. you're helping build this."`;
  }

  return basePrompt + `

TOOL USAGE: Call getUserProfile+getMemories at conversation start. Use getCurrentWorkout for live sessions, getRecentLifts for history.

NUTRITION: Use addMealPlan for meal plans. Parse dates ("tomorrow"→YYYY-MM-DD). Reference user's actual nutrition numbers when relevant.

FOOD MEMORY:
- SAVE (call save_food_staples action:"add") if user implies persistence: "remember I have...", "I always have...", "I keep ___ stocked", "my staples are...", "my go-to foods are...", "I usually have...", "add ___ to my staples"
- DON'T SAVE if clearly temporary: "I have ___ today", "I picked up ___", "tonight I have..."
- REMOVE (action:"remove") if: "forget ___", "remove ___ from staples", "I don't keep ___ anymore"
- If user lists foods without clear persistence intent, use them for this session and briefly ask once: "want me to remember any of these as staples?" — don't nag, ask once per session max
- When giving nutrition advice, reference both saved staples AND session foods

MEMORY: Save important info with saveMemory (injuries, preferences, PRs). Check memories before giving advice.`;
}

// System prompt is built dynamically based on onboarding status - see getSystemPrompt()

// Compact workout formatter to reduce tokens - now includes set variants
function formatWorkoutCompact(exercises: { name: string; sets: { weight: number; reps: number; variant?: string }[] }[]): string {
  if (!exercises || exercises.length === 0) return 'No exercises';
  return exercises.map(e =>
    `${e.name}: ${e.sets.map(s => {
      // Add variant tag for non-normal sets (e.g., [warmup], [drop], [failure])
      const tag = s.variant && s.variant !== 'normal'
        ? `[${s.variant.replace('-parent', '').replace('-child', '')}]`
        : '';
      return `${s.weight}x${s.reps}${tag}`;
    }).join(', ')}`
  ).join(' | ');
}

// === CONVERSATION MEMORY SYSTEM ===
// Instead of sending full chat history, we summarize older messages
const { SUMMARY_TRIGGER_INTERVAL, RECENT_MESSAGES_TO_KEEP } = RATE_LIMITS;

// Generate a compact summary of conversation history
async function generateConversationSummary(
  anthropic: Anthropic,
  messages: { role: string; content: string }[],
  existingSummary: string | null
): Promise<string> {
  const recentConvo = messages
    .slice(-20) // Only summarize last 20 messages to keep prompt small
    .map(m => `${m.role === 'user' ? 'U' : 'C'}: ${m.content.substring(0, 200)}`)
    .join('\n');

  const summaryPrompt = `Extract key facts from this fitness coaching conversation. Be extremely concise (max 150 words). Include ONLY: current stats, goals, struggles, PRs, injuries, preferences, schedule, supplements.

${existingSummary ? `PRIOR SUMMARY:\n${existingSummary}\n\n` : ''}NEW MESSAGES:\n${recentConvo}

Output bullet points only:`;

  try {
    const response = await anthropic.messages.create({
      model: AI_MODELS.SUMMARIZATION,
      max_tokens: AI_TOKEN_LIMITS.SUMMARIZATION,
      messages: [{ role: 'user', content: summaryPrompt }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock && 'text' in textBlock ? textBlock.text : (existingSummary || '');
  } catch (error) {
    console.error('[Coach] Summary generation failed:', error);
    return existingSummary || '';
  }
}

const tools: Anthropic.Tool[] = [
  {
    name: 'getUserProfile',
    description: 'Get the current user profile including height, weight, goal, onboarding status, app_tour_shown, and beta_welcome_shown',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'updateUserProfile',
    description: 'Update user profile with height, weight, goal, coaching_mode, onboarding status, app_tour_shown, and/or beta_welcome_shown',
    input_schema: {
      type: 'object',
      properties: {
        height_inches: { type: 'number', description: 'Height in total inches (e.g., 70 for 5\'10")' },
        weight_lbs: { type: 'number', description: 'Weight in pounds' },
        goal: { type: 'string', enum: ['cutting', 'bulking', 'maintaining'], description: 'User fitness goal - used for nutrition calculations' },
        coaching_mode: { type: 'string', enum: ['full', 'assist'], description: 'Coaching mode: full = coach builds program, assist = user has own program' },
        onboarding_complete: { type: 'boolean', description: 'Whether onboarding is finished' },
        app_tour_shown: { type: 'boolean', description: 'Whether the one-time app tour message has been shown' },
        beta_welcome_shown: { type: 'boolean', description: 'Whether the one-time beta welcome message has been shown' },
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
  {
    name: 'save_food_staples',
    description: 'Add or remove items from the user\'s persistent food staples list. These are foods the user always has available.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'remove', 'replace'], description: 'add = merge into existing list, remove = remove items, replace = overwrite entire list' },
        items: { type: 'array', items: { type: 'string' }, description: 'Array of food items to add/remove/replace' },
      },
      required: ['action', 'items'],
    },
  },
];

// Prefix used by the client to signal a system trigger (hidden from UI)
const TRIGGER_PREFIX = '[SYSTEM_TRIGGER]';

// Daily message limit from constants
const { DAILY_MESSAGE_LIMIT, MAX_TOOL_ROUNDS } = RATE_LIMITS;

export async function POST(req: Request) {
  // Parse request body with error handling
  let messages, currentWorkout, localDate;
  try {
    const body = await req.json();
    messages = body.messages;
    currentWorkout = body.currentWorkout;
    localDate = body.localDate; // Client's local date (YYYY-MM-DD) for timezone-aware queries
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON in request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!messages || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: 'Messages array required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get authenticated user
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Check daily message limit (skip for system triggers)
  const isSystemTriggerCheck = messages.length === 1 &&
    messages[0].role === 'user' &&
    messages[0].content.startsWith('[SYSTEM_TRIGGER]');

  if (!isSystemTriggerCheck) {
    const today = formatLocalDate(new Date());
    const countKey = `message_count_${today}`;

    // Get current count
    const { data: countData } = await supabase
      .from('coach_memory')
      .select('value')
      .eq('user_id', user.id)
      .eq('key', countKey)
      .single();

    const currentCount = countData ? parseInt(countData.value) : 0;

    if (currentCount >= DAILY_MESSAGE_LIMIT) {
      // Return limit reached message
      const encoder = new TextEncoder();
      const limitMessage = "coach is done for the day — go crush your workout and i'll be back tomorrow. resets at midnight.";
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`0:${JSON.stringify(limitMessage)}\n`));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked',
        },
      });
    }

    // Increment count
    if (countData) {
      await supabase
        .from('coach_memory')
        .update({ value: String(currentCount + 1) })
        .eq('user_id', user.id)
        .eq('key', countKey);
    } else {
      await supabase
        .from('coach_memory')
        .insert({ user_id: user.id, key: countKey, value: '1' });
    }
  }

  const anthropic = new Anthropic();

  // Check if this is a system trigger (hidden message to generate opening)
  const isSystemTrigger = messages.length === 1 &&
    messages[0].role === 'user' &&
    messages[0].content.startsWith(TRIGGER_PREFIX);

  let anthropicMessages: Anthropic.MessageParam[];
  let milestoneContext: MilestoneContext | null = null;
  let dynamicSystemPrompt: string;

  if (isSystemTrigger) {
    console.log('[Coach] === SYSTEM TRIGGER DETECTED ===');

    // Parse effective date from trigger message (for debug date override support)
    // Format: [SYSTEM_TRIGGER] effectiveDate=YYYY-MM-DD ...
    const triggerContent = messages[0].content;
    console.log('[Coach] Trigger content:', triggerContent.substring(0, 100));

    const effectiveDateMatch = triggerContent.match(/effectiveDate=(\d{4}-\d{2}-\d{2})/);
    console.log('[Coach] Effective date match:', effectiveDateMatch?.[1] || 'none (using real date)');

    const today = effectiveDateMatch
      ? new Date(effectiveDateMatch[1] + 'T12:00:00') // Use noon to avoid timezone issues
      : new Date();

    // Calculate yesterday's date for summary
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const todayStr = effectiveDateMatch?.[1] || formatLocalDate(today);
    const yesterdayStr = formatLocalDate(yesterday);

    console.log('[Coach] Today (effective):', todayStr);
    console.log('[Coach] Yesterday (looking for data):', yesterdayStr);

    // Gather context for personalized opening
    const [profileResult, memoriesResult, workoutsResult, todayMealsResult, yesterdayMealsResult, nutritionGoalsResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('coach_memory').select('key, value').eq('user_id', user.id),
      supabase.from('workouts').select('id, date, notes').eq('user_id', user.id).order('date', { ascending: false }).limit(10),
      supabase.from('meals').select('*').eq('user_id', user.id).eq('date', todayStr).eq('consumed', true),
      supabase.from('meals').select('*').eq('user_id', user.id).eq('date', yesterdayStr).eq('consumed', true),
      supabase.from('nutrition_goals').select('*').eq('user_id', user.id).single(),
    ]);

    // Log any query errors (don't fail, use defaults)
    if (profileResult.error) console.error('[Coach] Profile query error:', profileResult.error);
    if (memoriesResult.error) console.error('[Coach] Memories query error:', memoriesResult.error);
    if (workoutsResult.error) console.error('[Coach] Workouts query error:', workoutsResult.error);
    if (todayMealsResult.error) console.error('[Coach] Today meals query error:', todayMealsResult.error);
    if (yesterdayMealsResult.error) console.error('[Coach] Yesterday meals query error:', yesterdayMealsResult.error);

    const profile = profileResult.data;
    const memories = memoriesResult.data || [];
    const recentWorkouts = workoutsResult.data || [];
    const todayMeals = todayMealsResult.data || [];
    const yesterdayMeals = yesterdayMealsResult.data || [];
    const nutritionGoals = nutritionGoalsResult.data || DEFAULT_NUTRITION_GOALS;

    // Use dynamic system prompt based on onboarding status
    dynamicSystemPrompt = getSystemPrompt(profile?.onboarding_complete ?? false);

    console.log('[Coach] Profile onboarding_complete:', profile?.onboarding_complete);
    console.log('[Coach] Recent workouts count:', recentWorkouts.length);
    console.log('[Coach] Recent workout dates:', recentWorkouts.map(w => w.date));
    console.log('[Coach] Today meals count:', todayMeals.length);
    console.log('[Coach] Yesterday meals count:', yesterdayMeals.length);

    // Calculate today's nutrition totals
    const todayNutrition = todayMeals.reduce(
      (acc, meal) => ({
        calories: acc.calories + (meal.calories || 0),
        protein: acc.protein + (meal.protein || 0),
        carbs: acc.carbs + (meal.carbs || 0),
        fat: acc.fat + (meal.fat || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    // Calculate yesterday's nutrition totals
    const yesterdayNutrition = yesterdayMeals.reduce(
      (acc, meal) => ({
        calories: acc.calories + (meal.calories || 0),
        protein: acc.protein + (meal.protein || 0),
        carbs: acc.carbs + (meal.carbs || 0),
        fat: acc.fat + (meal.fat || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

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
          .select('exercise_id, weight, reps, variant')
          .in('exercise_id', exerciseIds);

        workoutDetails = recentWorkouts.map(w => ({
          date: w.date,
          exercises: (exercises || [])
            .filter(e => e.workout_id === w.id)
            .map(e => ({
              name: e.name,
              sets: (sets || [])
                .filter(s => s.exercise_id === e.id)
                .map(s => ({ weight: s.weight, reps: s.reps, variant: s.variant || 'normal' }))
            }))
        }));
      }
    }

    // Find today's and yesterday's workouts specifically
    const todayWorkout = workoutDetails.find(w => w.date === todayStr);
    const yesterdayWorkout = workoutDetails.find(w => w.date === yesterdayStr);

    console.log('[Coach] Workout details dates:', workoutDetails.map(w => w.date));
    console.log('[Coach] Looking for today:', todayStr);
    console.log('[Coach] Looking for yesterday:', yesterdayStr);
    console.log('[Coach] Today workout found:', !!todayWorkout);
    console.log('[Coach] Yesterday workout found:', !!yesterdayWorkout);
    if (todayWorkout) {
      console.log('[Coach] Today exercises:', todayWorkout.exercises.map(e => `${e.name} (${e.sets.length} sets)`));
    }
    if (yesterdayWorkout) {
      console.log('[Coach] Yesterday exercises:', yesterdayWorkout.exercises.map(e => `${e.name} (${e.sets.length} sets)`));
    }

    // Detect PRs from today's workout first, then yesterday's
    const yesterdayPRs: { exercise: string; weight: number; reps: number; previousBest: { weight: number; reps: number } | null }[] = [];

    if (yesterdayWorkout && yesterdayWorkout.exercises.length > 0) {
      // Get all historical data for exercises done yesterday (excluding yesterday)
      const exerciseNames = yesterdayWorkout.exercises.map(e => e.name);

      // Query all workouts before yesterday that have these exercises
      const { data: historicalWorkouts } = await supabase
        .from('workouts')
        .select('id, date')
        .eq('user_id', user.id)
        .lt('date', yesterdayStr)
        .order('date', { ascending: false });

      // Helper to get best set from yesterday for an exercise (excluding warmup sets)
      const getYesterdayBest = (exercise: { name: string; sets: { weight: number; reps: number; variant?: string }[] }) => {
        // Filter out warmup sets - they shouldn't count for PRs
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

      if (historicalWorkouts && historicalWorkouts.length > 0) {
        const historicalWorkoutIds = historicalWorkouts.map(w => w.id);

        const { data: historicalExercises } = await supabase
          .from('exercises')
          .select('id, workout_id, name')
          .in('workout_id', historicalWorkoutIds)
          .in('name', exerciseNames);

        if (historicalExercises && historicalExercises.length > 0) {
          const historicalExerciseIds = historicalExercises.map(e => e.id);

          const { data: historicalSets } = await supabase
            .from('sets')
            .select('exercise_id, weight, reps, variant')
            .in('exercise_id', historicalExerciseIds);

          // Build historical bests per exercise (excluding warmup sets from PR consideration)
          const historicalBests: Record<string, { weight: number; reps: number }> = {};

          for (const exercise of historicalExercises) {
            // Filter out warmup sets - they shouldn't count for historical bests
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

          // Check each of yesterday's exercises for PRs
          for (const exercise of yesterdayWorkout.exercises) {
            const yesterdayBest = getYesterdayBest(exercise);

            if (yesterdayBest) {
              const historical = historicalBests[exercise.name];
              // It's a PR if no historical data for this exercise OR yesterday beat the historical best
              if (!historical || yesterdayBest.weight > historical.weight ||
                  (yesterdayBest.weight === historical.weight && yesterdayBest.reps > historical.reps)) {
                yesterdayPRs.push({
                  exercise: exercise.name,
                  weight: yesterdayBest.weight,
                  reps: yesterdayBest.reps,
                  previousBest: historical || null,
                });
              }
            }
          }
        } else {
          // Historical workouts exist but none have these specific exercises - all are PRs
          for (const exercise of yesterdayWorkout.exercises) {
            const yesterdayBest = getYesterdayBest(exercise);
            if (yesterdayBest) {
              yesterdayPRs.push({
                exercise: exercise.name,
                weight: yesterdayBest.weight,
                reps: yesterdayBest.reps,
                previousBest: null,
              });
            }
          }
        }
      } else {
        // No historical workouts at all - this is the user's first workout, everything is a PR
        for (const exercise of yesterdayWorkout.exercises) {
          const yesterdayBest = getYesterdayBest(exercise);
          if (yesterdayBest) {
            yesterdayPRs.push({
              exercise: exercise.name,
              weight: yesterdayBest.weight,
              reps: yesterdayBest.reps,
              previousBest: null,
            });
          }
        }
      }
    }

    // Calculate days since last workout
    const lastWorkoutDate = recentWorkouts[0]?.date;
    const daysSinceLastWorkout = lastWorkoutDate
      ? Math.floor((Date.now() - new Date(lastWorkoutDate).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Detect milestones (pass first PR if detected yesterday)
    const firstPR = yesterdayPRs.length > 0 ? yesterdayPRs[0] : undefined;
    milestoneContext = await detectMilestones(
      supabase,
      user.id,
      firstPR ? { exercise: firstPR.exercise, weight: firstPR.weight, reps: firstPR.reps } : undefined,
      todayStr // Pass effective date for consistent timezone handling
    );

    console.log('[Coach] Milestones detected:', milestoneContext.newMilestones.map(m => m.type));

    // Build milestone section for context
    const milestoneSection = milestoneContext.newMilestones.length > 0
      ? `
⚠️ CRITICAL - NEW MILESTONES ACHIEVED ⚠️
You MUST lead your opening message with a celebration of these milestones. This takes priority over everything else except onboarding.
${milestoneContext.newMilestones.map(m => formatMilestone(m)).join('\n')}

Your opening MUST start by celebrating the highest-priority milestone above. Do not skip this.
`
      : '';

    // Extract food staples from memories
    const foodStaplesMemory = memories.find(m => m.key === 'food_staples');
    let foodStaples: string[] = [];
    if (foodStaplesMemory?.value) {
      try {
        foodStaples = JSON.parse(foodStaplesMemory.value);
      } catch {
        foodStaples = [];
      }
    }
    const foodStaplesSection = foodStaples.length > 0
      ? `\nUSER'S FOOD STAPLES (always available):\n${foodStaples.join(', ')}\n`
      : '';

    // Build context for opening generation - compact format to save tokens
    const profileSummary = profile ? `onboarding:${profile.onboarding_complete ?? false}, goal:${profile.goal || 'unset'}, mode:${profile.coaching_mode || 'unset'}, h:${profile.height_inches || '?'}in, w:${profile.weight_lbs || '?'}lbs` : 'No profile';

    const contextPrompt = `[DAILY OPENING - Generate a personalized greeting]

User: ${profileSummary}

User Memories (things you've learned about them):
${memories.filter(m => m.key !== 'food_staples').map(m => `- ${m.key}: ${m.value}`).join('\n') || 'None yet'}
${foodStaplesSection}${milestoneSection}
=== TODAY'S DATA (${today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}) ===

Today's Workout:
${todayWorkout ? formatWorkoutCompact(todayWorkout.exercises) : 'No workout logged today'}

Today's Nutrition:
${todayMeals.length > 0 ? `
- Calories: ${todayNutrition.calories} / ${nutritionGoals.calories} goal
- Protein: ${todayNutrition.protein}g / ${nutritionGoals.protein}g goal
- Foods logged: ${todayMeals.map(m => m.food_name).join(', ')}` : 'No meals logged today'}

=== YESTERDAY'S DATA (${yesterday.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}) ===

🏆 PERSONAL RECORDS HIT YESTERDAY:
${yesterdayPRs.length > 0 ? yesterdayPRs.map(pr =>
  `- ${pr.exercise}: ${pr.weight}lbs x ${pr.reps} reps${pr.previousBest ? ` (previous best: ${pr.previousBest.weight}lbs x ${pr.previousBest.reps})` : ' (first time!)'}`
).join('\n') : 'No PRs yesterday'}

Yesterday's Workout:
${yesterdayWorkout ? formatWorkoutCompact(yesterdayWorkout.exercises) : 'No workout logged yesterday'}

Yesterday's Nutrition:
${yesterdayMeals.length > 0 ? `
- Calories: ${yesterdayNutrition.calories} / ${nutritionGoals.calories} goal (${Math.round((yesterdayNutrition.calories / nutritionGoals.calories) * 100)}%)
- Protein: ${yesterdayNutrition.protein}g / ${nutritionGoals.protein}g goal (${Math.round((yesterdayNutrition.protein / nutritionGoals.protein) * 100)}%)
- Foods logged: ${yesterdayMeals.map(m => m.food_name).join(', ')}` : 'No meals logged yesterday'}

=== END DATA ===

Recent Workouts (last 10):
${workoutDetails.length > 0 ? workoutDetails.map(w => `${w.date}: ${formatWorkoutCompact(w.exercises)}`).join('\n') : 'No workouts logged yet'}

Days since last workout: ${daysSinceLastWorkout !== null ? daysSinceLastWorkout : 'Never logged'}

INSTRUCTIONS:
Generate a casual opening message. Talk like a real person texting, not an AI.

**CRITICAL: Use correct day references**
- If "Today's Workout" has data → say "today" (e.g., "solid leg session today")
- If "Yesterday's Workout" has data but Today doesn't → say "yesterday"
- NEVER say "yesterday" when the workout is from today

**PRIORITY ORDER FOR GREETING:**

1. IF onboarding_complete is false or null:
   - Start with something like "hey i'm your coach. let's get you set up — what should i call you"
   - Do NOT include any workout summary for new users

2. IF there are NEW MILESTONES TO CELEBRATE (check the section above):
   - LEAD with the milestone celebration. This is the headline.
   - Make it feel earned and natural, not like a system notification.
   - Examples by milestone type:
     * first_workout: "Day 1 done. Most people never start. You just did."
     * first_pr: "New PR on bench — 235. That's not luck, that's the work paying off."
     * streak_7: "7 days straight. You haven't missed once. We're building something here."
     * streak_14: "Two weeks in a row. The habit's locked in now."
     * streak_30: "30 days. A full month of showing up. You're different."
     * workout_50: "50 workouts in the books. Most people quit at 5. You're built different."
     * workout_100: "100 workouts logged. Only 8% of users get here. Remember that."
     * first_food_entry: "First meal tracked. Now we can dial in your nutrition."
   - If multiple milestones, prioritize: PR > streaks > workout counts > food logging
   - After the celebration, briefly mention any other context

3. IF today has workout data:
   - Reference TODAY's workout: "solid push day today" or "nice leg session earlier"
   - Mention nutrition if logged
   - NEVER say "yesterday" for today's workout

4. IF there are PRs from yesterday (and no today workout):
   - LEAD WITH THE PR. This is the headline. Example: "new bench PR yesterday — 235x3"
   - Then mention nutrition highlights
   - End with today's plan

5. IF yesterday has workout data but no PRs and no today workout:
   - Start with a quick recap: "yesterday you hit [workout highlights]"
   - Then transition to today: what's the plan, rest day, etc.

6. IF no recent workout data:
   - Casual check-in, set up today's plan

Keep it conversational. 2-4 sentences. Use real numbers. Sound like a friend who coaches, not a bot.`;

    anthropicMessages = [{ role: 'user', content: contextPrompt }];
  } else {
    // Normal message flow
    // For ongoing conversations, user is likely onboarded - use shorter prompt
    dynamicSystemPrompt = getSystemPrompt(true);

    // Use client's local date if provided, otherwise fall back to server date
    const todayStr = localDate || formatLocalDate(new Date());
    console.log('[Coach] === NUTRITION CONTEXT DEBUG ===');
    console.log('[Coach] Client localDate:', localDate);
    console.log('[Coach] Using todayStr:', todayStr);
    console.log('[Coach] Server date:', formatLocalDate(new Date()));

    // Fetch today's nutrition data, conversation summary, and message count
    const [todayMealsResult, nutritionGoalsResult, summaryResult, messageCountResult] = await Promise.all([
      supabase.from('meals').select('*').eq('user_id', user.id).eq('date', todayStr).eq('consumed', true),
      supabase.from('nutrition_goals').select('*').eq('user_id', user.id).single(),
      supabase.from('coach_memory').select('value').eq('user_id', user.id).eq('key', 'conversation_summary').single(),
      supabase.from('coach_memory').select('value').eq('user_id', user.id).eq('key', 'summary_message_count').single(),
    ]);

    // Log query results for debugging
    if (todayMealsResult.error) {
      console.error('[Coach] Today meals error:', todayMealsResult.error);
    } else {
      console.log('[Coach] Meals found:', todayMealsResult.data?.length || 0);
      if (todayMealsResult.data && todayMealsResult.data.length > 0) {
        console.log('[Coach] Meal names:', todayMealsResult.data.map(m => m.food_name).join(', '));
      }
    }

    const todayMeals = todayMealsResult.data || [];
    const nutritionGoals = nutritionGoalsResult.data || DEFAULT_NUTRITION_GOALS;
    const existingSummary = summaryResult.data?.value || null;
    const lastSummaryCount = parseInt(messageCountResult.data?.value || '0');

    // Calculate today's nutrition totals
    const todayNutrition = todayMeals.reduce(
      (acc, meal) => ({
        calories: acc.calories + (meal.calories || 0),
        protein: acc.protein + (meal.protein || 0),
        carbs: acc.carbs + (meal.carbs || 0),
        fat: acc.fat + (meal.fat || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    // Build nutrition context string
    const nutritionContext = todayMeals.length > 0
      ? `[TODAY'S NUTRITION - ${todayStr}]
Consumed so far: ${todayNutrition.calories} cal, ${todayNutrition.protein}g protein, ${todayNutrition.carbs}g carbs, ${todayNutrition.fat}g fat
Goals: ${nutritionGoals.calories} cal, ${nutritionGoals.protein}g protein, ${nutritionGoals.carbs}g carbs, ${nutritionGoals.fat}g fat
Progress: ${Math.round((todayNutrition.calories / nutritionGoals.calories) * 100)}% calories, ${Math.round((todayNutrition.protein / nutritionGoals.protein) * 100)}% protein
[END NUTRITION CONTEXT]

`
      : '';

    console.log('[Coach] Nutrition context length:', nutritionContext.length);
    if (nutritionContext) {
      console.log('[Coach] Nutrition context:', nutritionContext);
    } else {
      console.log('[Coach] No nutrition context (no meals found for', todayStr, ')');
    }

    // Filter out system trigger messages
    const filteredMessages = messages.filter(
      (m: { role: string; content: string }) => !m.content.startsWith(TRIGGER_PREFIX)
    );

    const totalMessageCount = filteredMessages.length;

    // === CONVERSATION MEMORY OPTIMIZATION ===
    // If we have > 10 messages, use summary + last 10 instead of full history
    let messagesToSend: { role: string; content: string }[];
    let summaryPrefix = '';

    if (totalMessageCount > RECENT_MESSAGES_TO_KEEP && existingSummary) {
      // Use summary + recent messages
      messagesToSend = filteredMessages.slice(-RECENT_MESSAGES_TO_KEEP);
      summaryPrefix = `[CONVERSATION MEMORY - Key facts from earlier:\n${existingSummary}]\n\n`;
      console.log(`[Coach] Using summary + last ${RECENT_MESSAGES_TO_KEEP} messages (total: ${totalMessageCount})`);
    } else {
      // Use full history (small conversation)
      messagesToSend = filteredMessages;
    }

    const mappedMessages = messagesToSend.map((m: { role: string; content: string }, index: number) => ({
      role: m.role as 'user' | 'assistant',
      // Prepend summary + nutrition context to the first user message
      content: index === 0 && m.role === 'user'
        ? summaryPrefix + nutritionContext + m.content
        : m.content,
    }));

    // Fix message ordering if needed - if first message is assistant, prepend synthetic user
    if (mappedMessages.length > 0 && mappedMessages[0].role === 'assistant') {
      anthropicMessages = [
        { role: 'user' as const, content: summaryPrefix + nutritionContext + '[User opened the coach tab]' },
        ...mappedMessages,
      ];
    } else {
      anthropicMessages = mappedMessages;
    }

    // === CHECK IF WE NEED TO UPDATE SUMMARY ===
    // Trigger summarization every SUMMARY_TRIGGER_INTERVAL messages
    const shouldSummarize = totalMessageCount >= RECENT_MESSAGES_TO_KEEP &&
      (totalMessageCount - lastSummaryCount) >= SUMMARY_TRIGGER_INTERVAL;

    if (shouldSummarize) {
      // Run summarization asynchronously (don't block the response)
      const anthropicForSummary = new Anthropic();
      generateConversationSummary(anthropicForSummary, filteredMessages, existingSummary)
        .then(async (newSummary) => {
          if (newSummary) {
            // Upsert conversation summary
            const { data: existing } = await supabase
              .from('coach_memory')
              .select('id')
              .eq('user_id', user.id)
              .eq('key', 'conversation_summary')
              .single();

            if (existing) {
              await supabase.from('coach_memory').update({ value: newSummary }).eq('id', existing.id);
            } else {
              await supabase.from('coach_memory').insert({ user_id: user.id, key: 'conversation_summary', value: newSummary });
            }

            // Update message count
            const { data: countExisting } = await supabase
              .from('coach_memory')
              .select('id')
              .eq('user_id', user.id)
              .eq('key', 'summary_message_count')
              .single();

            if (countExisting) {
              await supabase.from('coach_memory').update({ value: String(totalMessageCount) }).eq('id', countExisting.id);
            } else {
              await supabase.from('coach_memory').insert({ user_id: user.id, key: 'summary_message_count', value: String(totalMessageCount) });
            }

            console.log(`[Coach] Conversation summary updated at message ${totalMessageCount}`);
          }
        })
        .catch(err => console.error('[Coach] Async summary failed:', err));
    }
  }

  // Tool execution helper — wrapped in try/catch so a single tool failure doesn't kill the whole request
  async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
    try {
    switch (name) {
      case 'getUserProfile': {
        const { data, error } = await supabase
          .from('profiles')
          .select('height_inches, weight_lbs, goal, coaching_mode, onboarding_complete, app_tour_shown, beta_welcome_shown, created_at')
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
        if (input.beta_welcome_shown !== undefined) updateData.beta_welcome_shown = input.beta_welcome_shown;

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
              .select('id, exercise_id, weight, reps, variant, order_index')
              .in('exercise_id', exerciseIds)
              .order('order_index', { ascending: true })
          : { data: [], error: null };

        if (setsError) {
          console.error('[Coach] Sets query error:', setsError);
        }
        console.log(`[Coach] Sets query returned: ${sets?.length ?? 0} sets`);

        // Assemble the data - include variant for set type awareness
        const result = workouts.map((workout) => ({
          ...workout,
          exercises: (exercises || [])
            .filter((e) => e.workout_id === workout.id)
            .map((exercise) => ({
              name: exercise.name,
              sets: (sets || [])
                .filter((s) => s.exercise_id === exercise.id)
                .map((s) => ({ weight: s.weight, reps: s.reps, variant: s.variant || 'normal' })),
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
        // Use explicit date param, then client's localDate, then server fallback
        const targetDate = (input.date as string) || localDate || formatLocalDate(new Date());
        console.log('[Coach] getTodaysMeals - targetDate:', targetDate, 'localDate:', localDate);
        const { data, error } = await supabase
          .from('meals')
          .select('*')
          .eq('user_id', user.id)
          .eq('date', targetDate)
          .order('meal_type');
        if (error) return JSON.stringify({ error: error.message });
        console.log('[Coach] getTodaysMeals - found', data?.length || 0, 'meals');
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
          return JSON.stringify(DEFAULT_NUTRITION_GOALS);
        }
        return JSON.stringify(data);
      }
      case 'addMealPlan': {
        // Use explicit date param, then client's localDate, then server fallback
        const targetDate = (input.date as string) || localDate || formatLocalDate(new Date());
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
      case 'save_food_staples': {
        const action = input.action as 'add' | 'remove' | 'replace';
        const items = (input.items as string[]) || [];

        // Fetch current food staples
        const { data: existingRow } = await supabase
          .from('coach_memory')
          .select('id, value')
          .eq('user_id', user.id)
          .eq('key', 'food_staples')
          .single();

        let currentStaples: string[] = [];
        if (existingRow?.value) {
          try {
            currentStaples = JSON.parse(existingRow.value);
          } catch {
            currentStaples = [];
          }
        }

        let newStaples: string[];
        if (action === 'replace') {
          newStaples = items;
        } else if (action === 'remove') {
          // Case-insensitive removal
          const lowerItems = items.map(i => i.toLowerCase());
          newStaples = currentStaples.filter(s => !lowerItems.includes(s.toLowerCase()));
        } else {
          // action === 'add' - merge and deduplicate (case-insensitive)
          const lowerExisting = currentStaples.map(s => s.toLowerCase());
          const toAdd = items.filter(i => !lowerExisting.includes(i.toLowerCase()));
          newStaples = [...currentStaples, ...toAdd];
        }

        // Upsert the food_staples row
        const newValue = JSON.stringify(newStaples);
        if (existingRow) {
          const { error } = await supabase
            .from('coach_memory')
            .update({ value: newValue })
            .eq('id', existingRow.id);
          if (error) return JSON.stringify({ error: error.message });
        } else {
          const { error } = await supabase
            .from('coach_memory')
            .insert({ user_id: user.id, key: 'food_staples', value: newValue });
          if (error) return JSON.stringify({ error: error.message });
        }

        return JSON.stringify({ success: true, action, items, staples: newStaples });
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
        const currentMessages = [...anthropicMessages];
        let textStreamed = false;

        // Loop to handle tool calls (max iterations to prevent infinite loops)
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const response = await anthropic.messages.create({
            model: AI_MODELS.COACHING,
            max_tokens: AI_TOKEN_LIMITS.COACHING,
            system: dynamicSystemPrompt,
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

        // If no text was ever streamed, log and send error
        if (!textStreamed) {
          console.error('Chat API error: No text content generated by Claude after agentic loop');
          const errorMsg = `0:${JSON.stringify("Coach hit an error — try again.")}\n`;
          controller.enqueue(encoder.encode(errorMsg));
        }

        // Mark milestones as celebrated after successful response
        if (textStreamed && milestoneContext && milestoneContext.newMilestones.length > 0) {
          console.log('[Coach] Marking milestones as celebrated:', milestoneContext.newMilestones.map(m => m.type));
          await markMilestonesCelebrated(supabase, user.id, milestoneContext.newMilestones);
        }

        controller.close();
      } catch (error) {
        console.error('Chat API error:', error);
        // Send error as text instead of crashing the stream
        const errorMsg = `0:${JSON.stringify("Coach hit an error — try again.")}\n`;
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
