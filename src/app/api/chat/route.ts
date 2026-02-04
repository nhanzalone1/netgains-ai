import { streamText, createDataStreamResponse, tool } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const systemPrompt = `You are a no-nonsense bodybuilding coach for the NetGains app. Your job is to help users build muscle and get stronger.

CRITICAL RULES:
1. Do NOT provide personalized training advice until you have used save_fitness_profile to record the user's stats (height, weight, goal).
2. If a user asks for workout advice without providing their stats, ask for their height (inches), weight (lbs), and goal (cut or bulk).
3. Use get_training_history to analyze their workout data when discussing progress or if strength seems to be dropping.
4. If strength is dropping, suggest lower volume or a deload week.
5. Keep responses brief and actionable - you're a coach, not a lecturer.
6. Focus on compound movements and progressive overload.`;

// Initialize Supabase client for server-side operations
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !serviceKey) {
    return null;
  }

  return createClient(url, serviceKey);
}

export async function POST(req: Request) {
  const { messages, userId } = await req.json();

  const supabase = getSupabase();

  return createDataStreamResponse({
    execute: (dataStream) => {
      const result = streamText({
        model: google("models/gemini-1.5-flash-latest"),
        system: systemPrompt,
        messages,
        tools: {
          save_fitness_profile: tool({
            description: "Save the user's fitness profile including height, weight, and goal. Call this when the user provides their stats.",
            parameters: z.object({
              height_inches: z.number().describe("User's height in inches"),
              weight_lbs: z.number().describe("User's weight in pounds"),
              goal: z.enum(["cut", "bulk"]).describe("User's goal: cut (lose fat) or bulk (gain muscle)"),
            }),
            execute: async ({ height_inches, weight_lbs, goal }) => {
              if (!supabase || !userId) {
                return { success: false, error: "Unable to save profile - not authenticated" };
              }

              try {
                // Upsert fitness profile data
                const { error } = await supabase
                  .from("profiles")
                  .update({
                    height_inches,
                    weight_lbs,
                    goal,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", userId);

                if (error) {
                  console.error("Error saving profile:", error);
                  return { success: false, error: error.message };
                }

                return {
                  success: true,
                  message: `Profile saved: ${height_inches}" tall, ${weight_lbs}lbs, goal: ${goal}`,
                  data: { height_inches, weight_lbs, goal },
                };
              } catch (err) {
                console.error("Profile save error:", err);
                return { success: false, error: "Failed to save profile" };
              }
            },
          }),

          get_training_history: tool({
            description: "Get the user's recent workout history to analyze their training progress and identify any strength drops.",
            parameters: z.object({
              days: z.number().optional().default(30).describe("Number of days of history to retrieve"),
              exercise_name: z.string().optional().describe("Filter by specific exercise name"),
            }),
            execute: async ({ days, exercise_name }) => {
              if (!supabase || !userId) {
                return { success: false, error: "Unable to get history - not authenticated", workouts: [] };
              }

              try {
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - days);

                // Query workouts with exercises and sets
                let query = supabase
                  .from("workouts")
                  .select(`
                    id,
                    date,
                    notes,
                    exercises (
                      id,
                      name,
                      sets (
                        weight,
                        reps
                      )
                    )
                  `)
                  .eq("user_id", userId)
                  .gte("date", startDate.toISOString().split("T")[0])
                  .order("date", { ascending: false })
                  .limit(20);

                const { data: workouts, error } = await query;

                if (error) {
                  console.error("Error fetching workouts:", error);
                  return { success: false, error: error.message, workouts: [] };
                }

                // Filter by exercise name if provided
                let filteredWorkouts = workouts || [];
                if (exercise_name) {
                  filteredWorkouts = filteredWorkouts.map((w: any) => ({
                    ...w,
                    exercises: w.exercises.filter((e: any) =>
                      e.name.toLowerCase().includes(exercise_name.toLowerCase())
                    ),
                  })).filter((w: any) => w.exercises.length > 0);
                }

                // Calculate summary stats
                const summary = {
                  total_workouts: filteredWorkouts.length,
                  exercises_logged: filteredWorkouts.reduce(
                    (acc: number, w: any) => acc + w.exercises.length,
                    0
                  ),
                };

                return {
                  success: true,
                  summary,
                  workouts: filteredWorkouts.slice(0, 10), // Limit to 10 most recent
                };
              } catch (err) {
                console.error("History fetch error:", err);
                return { success: false, error: "Failed to fetch history", workouts: [] };
              }
            },
          }),

          get_current_maxes: tool({
            description: "Get the user's current 1RM maxes for squat, bench, and deadlift.",
            parameters: z.object({}),
            execute: async () => {
              if (!supabase || !userId) {
                return { success: false, error: "Unable to get maxes - not authenticated" };
              }

              try {
                const { data, error } = await supabase
                  .from("program_settings")
                  .select("squat_max, bench_max, deadlift_max")
                  .eq("user_id", userId)
                  .single();

                if (error) {
                  return { success: false, error: "No maxes found" };
                }

                return {
                  success: true,
                  maxes: {
                    squat: data.squat_max,
                    bench: data.bench_max,
                    deadlift: data.deadlift_max,
                  },
                };
              } catch (err) {
                return { success: false, error: "Failed to fetch maxes" };
              }
            },
          }),
        },
        maxSteps: 5, // Allow multiple tool calls
      });

      result.mergeIntoDataStream(dataStream);
    },
  });
}
