import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { AI_MODELS } from '@/lib/constants';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { MUSCLE_GROUPS, type MuscleGroup } from '@/lib/supabase/types';

const anthropic = new Anthropic();

// Valid muscle groups for categorization (excluding "other" - we return null for uncertain)
const VALID_MUSCLE_GROUPS = MUSCLE_GROUPS;

// Categorize a single exercise using AI
export async function POST(request: Request) {
  try {
    // Verify authentication
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 10 requests per minute per user
    const rateLimitResult = checkRateLimit(`categorize_${user.id}`, RATE_LIMITS.AI_ENDPOINT);
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult);
    }

    const { exerciseName } = await request.json();

    if (!exerciseName || typeof exerciseName !== 'string') {
      return Response.json({ error: 'exerciseName is required' }, { status: 400 });
    }

    // Validate input length
    if (exerciseName.length > 100) {
      return Response.json({ error: 'Exercise name too long (max 100 characters)' }, { status: 400 });
    }

    const muscleGroup = await categorizeExercise(exerciseName);

    // Return null if we couldn't categorize - UI will show no selection
    return Response.json({ muscleGroup: muscleGroup || null });
  } catch (error) {
    console.error('[Exercise Categorize] Error:', error);
    return Response.json({ error: 'Failed to categorize exercise' }, { status: 500 });
  }
}

// Shared function for categorizing an exercise
// Returns null if unable to categorize with confidence
export async function categorizeExercise(exerciseName: string): Promise<MuscleGroup | null> {
  const prompt = `Categorize this exercise into exactly ONE primary muscle group.

Exercise: "${exerciseName}"

Valid categories (respond with ONLY one of these exact strings):
- chest (bench press variations, chest fly, push-ups, dips with forward lean)
- back (lat pulldown, pull-ups, chin-ups, rows, shrugs, deadlifts, t-bar rows, cable rows, straight arm pulldown)
- biceps (all curl variations, hammer curls, preacher curls, concentration curls)
- triceps (pushdowns, skull crushers, tricep dips, close grip bench, overhead extensions)
- front_delt (overhead press, military press, front raises, arnold press)
- side_delt (lateral raises, upright rows, face pulls with wide grip)
- rear_delt (reverse fly, face pulls, rear delt rows, band pull-aparts)
- quads (squats, leg press, leg extension, lunges, hack squats, sissy squats)
- hamstrings (leg curls, Romanian deadlifts, stiff leg deadlifts, good mornings)
- glutes (hip thrusts, glute bridges, kickbacks, Bulgarian split squats)
- calves (standing calf raises, seated calf raises, donkey calf raises)
- abs (crunches, planks, leg raises, ab rollouts, Russian twists, dead bugs, sit-ups)
- forearms (wrist curls, reverse curls, farmer's walks, grip exercises)

CRITICAL RULES:
- "Press" alone or with direction (incline/decline/flat) = chest
- "Overhead press" / "shoulder press" / "military press" = front_delt
- "Pulldown" / "pull down" = back
- "Pushdown" / "push down" = triceps
- "Curl" = biceps (unless "leg curl" = hamstrings, "wrist curl" = forearms)
- "Row" = back (unless "upright row" = side_delt)
- "Raise" with "lateral" or "side" = side_delt
- "Raise" with "front" = front_delt
- "Raise" with "rear" = rear_delt
- "Fly" / "Flye" = chest (unless "reverse fly" = rear_delt)
- "Extension" with "leg" = quads, with "tricep/overhead" = triceps
- "Squat" / "Lunge" = quads (glute involvement is secondary)
- "Deadlift" = back (primary mover is back, not hamstrings)

If you cannot determine the muscle group with high confidence, respond with exactly: UNKNOWN

Respond with ONLY the category name or UNKNOWN, nothing else.`;

  try {
    const response = await anthropic.messages.create({
      model: AI_MODELS.NUTRITION_ESTIMATE, // Haiku for speed
      max_tokens: 20,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text'
      ? response.content[0].text.trim().toLowerCase()
      : null;

    if (!text || text === 'unknown') {
      console.log(`[Exercise Categorize] AI returned unknown for "${exerciseName}"`);
      return null;
    }

    // Validate the response is a valid muscle group
    if (VALID_MUSCLE_GROUPS.includes(text as MuscleGroup)) {
      return text as MuscleGroup;
    }

    console.warn(`[Exercise Categorize] Invalid response "${text}" for "${exerciseName}"`);
    return null;
  } catch (error) {
    console.error(`[Exercise Categorize] AI error for "${exerciseName}":`, error);
    return null;
  }
}

// Batch categorize multiple exercises (for migration)
// Returns only exercises that were successfully categorized (excludes null results)
export async function categorizeExercises(exercises: { id: string; name: string }[]): Promise<{ id: string; muscleGroup: MuscleGroup }[]> {
  const results: { id: string; muscleGroup: MuscleGroup }[] = [];

  // Process in parallel batches of 10 to avoid rate limits
  const batchSize = 10;
  for (let i = 0; i < exercises.length; i += batchSize) {
    const batch = exercises.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (ex) => {
        const muscleGroup = await categorizeExercise(ex.name);
        return muscleGroup ? { id: ex.id, muscleGroup } : null;
      })
    );
    // Filter out null results (exercises that couldn't be categorized)
    results.push(...batchResults.filter((r): r is { id: string; muscleGroup: MuscleGroup } => r !== null));

    // Small delay between batches to avoid rate limits
    if (i + batchSize < exercises.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return results;
}
