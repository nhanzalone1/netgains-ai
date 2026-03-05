import Anthropic from '@anthropic-ai/sdk';
import { AI_MODELS } from '@/lib/constants';

const anthropic = new Anthropic();

// Valid muscle groups for categorization
const VALID_MUSCLE_GROUPS = [
  'chest',
  'front_delt',
  'side_delt',
  'rear_delt',
  'lats',
  'upper_back',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'other',
] as const;

type MuscleGroup = typeof VALID_MUSCLE_GROUPS[number];

// Categorize a single exercise using AI
export async function POST(request: Request) {
  try {
    const { exerciseName } = await request.json();

    if (!exerciseName || typeof exerciseName !== 'string') {
      return Response.json({ error: 'exerciseName is required' }, { status: 400 });
    }

    const muscleGroup = await categorizeExercise(exerciseName);

    return Response.json({ muscleGroup });
  } catch (error) {
    console.error('[Exercise Categorize] Error:', error);
    return Response.json({ error: 'Failed to categorize exercise' }, { status: 500 });
  }
}

// Shared function for categorizing an exercise
export async function categorizeExercise(exerciseName: string): Promise<MuscleGroup> {
  const prompt = `Categorize this exercise into exactly ONE muscle group.

Exercise: "${exerciseName}"

Valid categories (respond with ONLY one of these exact strings):
- chest (bench press, chest fly, push-ups targeting chest)
- front_delt (front raises, overhead press - front deltoid focus)
- side_delt (lateral raises, upright rows - side deltoid focus)
- rear_delt (reverse fly, face pulls, rear delt rows)
- lats (lat pulldown, pull-ups, straight arm pulldown)
- upper_back (rows, shrugs, back exercises not targeting lats specifically)
- biceps (curls, hammer curls, preacher curls)
- triceps (pushdowns, skull crushers, tricep dips, close grip bench)
- quads (squats, leg press, leg extension, lunges)
- hamstrings (leg curls, Romanian deadlifts, stiff leg deadlifts)
- glutes (hip thrusts, glute bridges, kickbacks)
- calves (calf raises, seated calf raises)
- core (crunches, planks, leg raises, ab rollouts)
- other (anything that doesn't fit above)

Important:
- Overhead press / military press = front_delt (primary mover is front delt)
- Lateral raise = side_delt
- Face pull / reverse fly = rear_delt
- Deadlift / barbell row = upper_back (not lats)
- Lat pulldown / pull-up = lats
- Tricep pushdown / cable pushdown = triceps
- Dips can be triceps or chest depending on form, default to triceps

Respond with ONLY the category name, nothing else.`;

  try {
    const response = await anthropic.messages.create({
      model: AI_MODELS.NUTRITION_ESTIMATE, // Haiku for speed
      max_tokens: 20,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text'
      ? response.content[0].text.trim().toLowerCase()
      : 'other';

    // Validate the response is a valid muscle group
    if (VALID_MUSCLE_GROUPS.includes(text as MuscleGroup)) {
      return text as MuscleGroup;
    }

    console.warn(`[Exercise Categorize] Invalid response "${text}" for "${exerciseName}", defaulting to other`);
    return 'other';
  } catch (error) {
    console.error(`[Exercise Categorize] AI error for "${exerciseName}":`, error);
    return 'other';
  }
}

// Batch categorize multiple exercises (for migration)
export async function categorizeExercises(exercises: { id: string; name: string }[]): Promise<{ id: string; muscleGroup: MuscleGroup }[]> {
  const results: { id: string; muscleGroup: MuscleGroup }[] = [];

  // Process in parallel batches of 10 to avoid rate limits
  const batchSize = 10;
  for (let i = 0; i < exercises.length; i += batchSize) {
    const batch = exercises.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (ex) => ({
        id: ex.id,
        muscleGroup: await categorizeExercise(ex.name),
      }))
    );
    results.push(...batchResults);

    // Small delay between batches to avoid rate limits
    if (i + batchSize < exercises.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return results;
}
