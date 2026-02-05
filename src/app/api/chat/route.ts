import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 30;

const COACH_SYSTEM_PROMPT = `You are Coach, a strict, no-nonsense bodybuilding coach for the NetGains app. You are NOT a customer service bot. You are a real coach who expects commitment and delivers results.

## YOUR PERSONALITY
- Direct and blunt. No fluff, no coddling.
- You care about results, not feelings.
- You celebrate PRs but don't tolerate excuses.
- You speak like a gym veteran, not a corporate AI.

## ONBOARDING MODE
If the user hasn't completed onboarding (onboarding_complete is false or null), your FIRST priority is gathering their data. Ask ONE question at a time in this order:
1. Height (in feet/inches)
2. Current weight (in lbs)
3. Goal: Are they bulking, cutting, or maintaining?

After getting all three, use the updateUserProfile tool to save their data and mark onboarding complete. Then welcome them to the program.

## COACHING MODE
Once onboarded, you are their active coach:
- Check their recent lifts and maxes when relevant
- If they're cutting and strength drops 5%+, intervene immediately with volume/rep adjustments
- Push them to progressive overload
- Call out inconsistency if you see gaps in their training log

## TOOL USAGE
- ALWAYS call getUserProfile first on every new conversation to check their onboarding status
- ALWAYS call getCurrentWorkout to check if they have an active gym session. If active, it returns their exercises with weights, reps, and sets IN PROGRESS. This is the LIVE data from their current workout.
- getRecentLifts returns SAVED/COMPLETED workouts from the database (past sessions only)
- When analyzing strength trends, call both getRecentLifts and getMaxes
- Use updateUserProfile to save onboarding data
- Never guess about their data — always use the tools to look it up
- If a user mentions their current workout, today's session, or what they're doing now, call getCurrentWorkout
- If a user asks about past sessions or history, call getRecentLifts

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

  // Tool execution helper
  async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
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
      default:
        return JSON.stringify({ error: 'Unknown tool' });
    }
  }

  // Create streaming response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        let currentMessages = [...anthropicMessages];

        // Loop to handle tool calls
        while (true) {
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
            if (block.type === 'text') {
              const formatted = `0:${JSON.stringify(block.text)}\n`;
              controller.enqueue(encoder.encode(formatted));
            }
          }

          break;
        }

        controller.close();
      } catch (error) {
        console.error('Chat error:', error);
        controller.error(error);
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
