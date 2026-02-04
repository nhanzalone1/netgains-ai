import { anthropic } from '@ai-sdk/anthropic';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 30;

const COACH_SYSTEM_PROMPT = `You are Coach, a strict, no-nonsense bodybuilding coach for the NetGains app. You are NOT a customer service bot. You are a real coach who expects commitment and delivers results.

## YOUR PERSONALITY
- Direct and blunt. No fluff, no coddling.
- You care about results, not feelings.
- You celebrate PRs but don't tolerate excuses.
- You speak like a gym veteran, not a corporate AI.

## ONBOARDING MODE
If the user hasn't completed onboarding (onboarding_complete is false), your FIRST priority is gathering their data. Ask ONE question at a time in this order:
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
- Use getUserProfile to check their stats and onboarding status
- Use getRecentLifts to analyze their training history
- Use getMaxes to see their current 1RMs
- Use updateUserProfile to save onboarding data
- Always check profile first to know if they're onboarded

## VOICE EXAMPLES
- "What's your height? Feet and inches."
- "185 at 5'10? Alright, we can work with that. Bulking or cutting?"
- "Your bench dropped 10 lbs in two weeks. That's not a plateau, that's a recovery problem. We're pulling back volume."
- "Four days since your last session. What happened?"

Stay in character. You're their coach, not their assistant.`;

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Get authenticated user
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const result = await streamText({
    model: anthropic('claude-3-5-sonnet-20241022'),
    system: COACH_SYSTEM_PROMPT,
    messages,
    tools: {
      getUserProfile: tool({
        description: 'Get the current user profile including height, weight, goal, and onboarding status',
        parameters: z.object({}),
        execute: async () => {
          const { data, error } = await supabase
            .from('profiles')
            .select('height_inches, weight_lbs, goal, onboarding_complete, created_at')
            .eq('id', user.id)
            .single();

          if (error) return { error: error.message };
          return data;
        },
      }),

      updateUserProfile: tool({
        description: 'Update user profile with height, weight, goal, and/or onboarding status',
        parameters: z.object({
          height_inches: z.number().optional().describe('Height in total inches (e.g., 70 for 5\'10")'),
          weight_lbs: z.number().optional().describe('Weight in pounds'),
          goal: z.enum(['bulk', 'cut', 'maintain']).optional().describe('User fitness goal'),
          onboarding_complete: z.boolean().optional().describe('Whether onboarding is finished'),
        }),
        execute: async (params) => {
          const updateData: Record<string, unknown> = {};
          if (params.height_inches !== undefined) updateData.height_inches = params.height_inches;
          if (params.weight_lbs !== undefined) updateData.weight_lbs = params.weight_lbs;
          if (params.goal !== undefined) updateData.goal = params.goal;
          if (params.onboarding_complete !== undefined) updateData.onboarding_complete = params.onboarding_complete;

          const { error } = await supabase
            .from('profiles')
            .update(updateData)
            .eq('id', user.id);

          if (error) return { error: error.message };
          return { success: true, updated: updateData };
        },
      }),

      getMaxes: tool({
        description: 'Get user current 1RM values for squat, bench, deadlift, overhead press',
        parameters: z.object({}),
        execute: async () => {
          const { data, error } = await supabase
            .from('maxes')
            .select('squat, bench, deadlift, overhead, updated_at')
            .eq('user_id', user.id)
            .single();

          if (error) return { error: error.message };
          return data;
        },
      }),

      getRecentLifts: tool({
        description: 'Get recent workout history including exercises and sets',
        parameters: z.object({
          limit: z.number().optional().default(5).describe('Number of recent workouts to fetch'),
        }),
        execute: async ({ limit }) => {
          const { data: workouts, error } = await supabase
            .from('workouts')
            .select(`
              id,
              date,
              exercises (
                id,
                name,
                sets (
                  weight,
                  reps,
                  rpe
                )
              )
            `)
            .eq('user_id', user.id)
            .order('date', { ascending: false })
            .limit(limit);

          if (error) return { error: error.message };
          return workouts;
        },
      }),
    },
  });

  // Create a streaming response manually
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of result.textStream) {
          // Format as data stream: 0:"text"
          const formatted = `0:${JSON.stringify(chunk)}\n`;
          controller.enqueue(encoder.encode(formatted));
        }
        controller.close();
      } catch (error) {
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
