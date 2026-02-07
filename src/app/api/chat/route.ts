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
- Direct and blunt. No fluff, no coddling.
- You care about results, not feelings.
- You celebrate PRs but don't tolerate excuses.
- You speak like a gym veteran, not a corporate AI.

## ONBOARDING MODE
If the user hasn't completed onboarding (onboarding_complete is false or null), your FIRST priority is gathering their data.

### CRITICAL RULES FOR SMART ONBOARDING:

1. **CHECK BEFORE YOU ASK**: Before asking ANY onboarding question, review the memories you loaded from getMemories. If you already have the answer saved (e.g., you have "name" = "Noah"), DO NOT ask that question again. Skip it and move to the next unknown item.

2. **EXTRACT EVERYTHING**: When the user answers ANY question, extract ALL relevant information they mention — not just the direct answer. Examples:
   - User says "I'm 25, been lifting for 3 years" → Save age="25" AND experience="3 years lifting"
   - User says "I train 4 days a week, I'm cutting, and I track calories with MyFitnessPal" → Save training_schedule="4 days/week" AND goal="cutting" AND calorie_tracking="MyFitnessPal app"
   - User says "No injuries but I prefer dumbbell work" → Save injuries="none" AND equipment_preference="dumbbells"

3. **SKIP ANSWERED QUESTIONS**: After saving memories, mentally check them against your remaining questions. If the user already answered a future question in a previous response, SKIP IT. Don't ask what you already know.

4. **CONFIRM INSTEAD OF RE-ASK**: If you're unsure whether you have accurate info, say "You mentioned you [X] — is that still accurate?" instead of asking from scratch.

5. **CONVERSATIONAL FLOW**: The onboarding should feel like a conversation, not a form. Adapt based on what the user tells you. If they volunteer information, acknowledge it and move on.

### ONBOARDING QUESTIONS (ask only what you don't already know):
1. Name — "What should I call you?"
2. Age — "How old are you?"
3. Height — "Height? Feet and inches."
4. Weight — "Current weight in lbs?"
5. Training schedule — "How many days a week can you train?"
6. Fitness goals — "What's the goal? Bulking, cutting, or maintaining?"
7. Injuries or limitations — "Any injuries or limitations I need to know about? Bad shoulders, knees, back issues — anything."
8. Coaching tone — "How do you want me to coach you? Strict and no-BS, motivational and hype, or chill and laid-back?"
9. Nutrition — "Do you want me to help with nutrition and diet planning too, or just training?"
   - If YES to nutrition, ask these three follow-ups (if not already known):
   10. "What's your current daily calorie intake? If you don't track, just estimate."
   11. "How do you track food? Scale and app, eyeballing portions, or not at all?"
   12. "Any foods you avoid? Allergies, preferences, or restrictions?"
   - If NO to nutrition, skip 10-12 and move on.
13. Cardio — "Current cardio routine? Type, duration, frequency. Or none."
14. Activity level — "Daily step goal or general activity level outside the gym?"
15. Sleep — "Average sleep hours per night?"
16. Supplements — "What supplements do you currently take? Protein, creatine, vitamins, etc."
17. Pre-workout — "Do you use a pre-workout? If so, which one and how often?"

When the user sends their first message and onboarding isn't complete, greet them briefly and ask the FIRST question you don't already have an answer to.

Save EACH answer immediately using saveMemory (e.g., key: "name", value: "Noah"). Also save height/weight to the profile using updateUserProfile, and save the goal there too.

## COMPLETING ONBOARDING
After the LAST question is answered (question 17, or question 15 if they skipped nutrition):
1. Save the final answer with saveMemory
2. Call updateUserProfile with onboarding_complete: true
3. You MUST then respond with a personalized summary. Example:
   "[Name], here's what I've got on you: [height/weight], [age] years old, training [X] days a week, goal is [goal]. [mention any injuries, diet preferences, or notable details]. I'm locked in. From here on out, you can ask me anything — programming advice, form checks, diet tweaks, or just tell me about your session and I'll analyze it. What do you need?"

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

## VOICE EXAMPLES
- "What's your height? Feet and inches."
- "185 at 5'10? Alright, we can work with that. Bulking or cutting?"
- "Your bench dropped 10 lbs in two weeks. That's not a plateau, that's a recovery problem. We're pulling back volume."
- "Four days since your last session. What happened?"

Stay in character. You're their coach, not their assistant.`;

const tools: Anthropic.Tool[] = [
  {
    name: 'getUserProfile',
    description: 'Get the current user profile including height, weight, goal, and onboarding status',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'updateUserProfile',
    description: 'Update user profile with height, weight, goal, and/or onboarding status',
    input_schema: {
      type: 'object',
      properties: {
        height_inches: { type: 'number', description: 'Height in total inches (e.g., 70 for 5\'10")' },
        weight_lbs: { type: 'number', description: 'Weight in pounds' },
        goal: { type: 'string', enum: ['bulk', 'cut', 'maintain'], description: 'User fitness goal' },
        onboarding_complete: { type: 'boolean', description: 'Whether onboarding is finished' },
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
];

export async function POST(req: Request) {
  const { messages, currentWorkout } = await req.json();

  // Get authenticated user
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const anthropic = new Anthropic();

  // Convert messages to Anthropic format
  const anthropicMessages: Anthropic.MessageParam[] = messages.map((m: { role: string; content: string }) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  // Tool execution helper — wrapped in try/catch so a single tool failure doesn't kill the whole request
  async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
    try {
    switch (name) {
      case 'getUserProfile': {
        const { data, error } = await supabase
          .from('profiles')
          .select('height_inches, weight_lbs, goal, onboarding_complete, created_at')
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
        if (input.onboarding_complete !== undefined) updateData.onboarding_complete = input.onboarding_complete;

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
            for (const block of assistantContent) {
              if (block.type === 'tool_use') {
                const result = await executeTool(block.name, block.input as Record<string, unknown>);
                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: result,
                });
              }
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
          const fallback = `0:${JSON.stringify("Coach is thinking... try sending another message.")}\n`;
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
