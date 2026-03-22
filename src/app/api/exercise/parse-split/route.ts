import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { AI_MODELS } from '@/lib/constants';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';

const anthropic = new Anthropic();

// Valid muscle groups
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
] as const;

type MuscleGroup = typeof VALID_MUSCLE_GROUPS[number];

interface SplitMapping {
  [splitDay: string]: MuscleGroup[];
}

// Parse split day names into muscle groups
export async function POST(request: Request) {
  try {
    // Verify authentication
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 10 requests per minute per user
    const rateLimitResult = checkRateLimit(`parse_split_${user.id}`, RATE_LIMITS.AI_ENDPOINT);
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult);
    }

    const { splitDays } = await request.json();

    if (!splitDays || !Array.isArray(splitDays)) {
      return Response.json({ error: 'splitDays array is required' }, { status: 400 });
    }

    // Filter out "Rest" days
    const trainingDays = splitDays.filter(
      (day: string) => day.toLowerCase() !== 'rest'
    );

    if (trainingDays.length === 0) {
      return Response.json({ mapping: {} });
    }

    const mapping = await parseSplitDays(trainingDays);

    return Response.json({ mapping });
  } catch (error) {
    console.error('[Parse Split] Error:', error);
    return Response.json({ error: 'Failed to parse split days' }, { status: 500 });
  }
}

async function parseSplitDays(splitDays: string[]): Promise<SplitMapping> {
  const prompt = `Parse these workout split day names into muscle groups.

Split days: ${JSON.stringify(splitDays)}

Valid muscle groups:
- chest
- front_delt (front raises, overhead press, incline pressing)
- side_delt (lateral raises, upright rows)
- rear_delt (reverse fly, face pulls)
- lats (pulldowns, pull-ups)
- upper_back (rows, shrugs)
- biceps
- triceps
- quads (squats, leg press, leg extensions)
- hamstrings (leg curls, RDLs)
- glutes (hip thrusts, kickbacks)
- calves
- core (abs)

Rules:
- "Chest/Front Delt" → ["chest", "front_delt"]
- "Back/Rear Delt" → ["lats", "upper_back", "rear_delt"]
- "Arms/Side Delt" → ["biceps", "triceps", "side_delt"]
- "Legs" → ["quads", "hamstrings", "glutes", "calves"]
- "Push" → ["chest", "front_delt", "triceps"]
- "Pull" → ["lats", "upper_back", "rear_delt", "biceps"]
- "Upper" → ["chest", "front_delt", "side_delt", "rear_delt", "lats", "upper_back", "biceps", "triceps"]
- "Lower" → ["quads", "hamstrings", "glutes", "calves"]
- "Shoulders" alone → ["front_delt", "side_delt", "rear_delt"]
- "Back" alone → ["lats", "upper_back"]
- "Arms" alone → ["biceps", "triceps"]
- Include "core" if mentioned or if it's a legs day

Respond with ONLY valid JSON object mapping each split day to an array of muscle groups.
Example: {"Chest/Front Delt": ["chest", "front_delt"], "Legs": ["quads", "hamstrings", "glutes", "calves", "core"]}`;

  try {
    const response = await anthropic.messages.create({
      model: AI_MODELS.NUTRITION_ESTIMATE, // Haiku for speed
      max_tokens: 500,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text'
      ? response.content[0].text.trim()
      : '{}';

    // Parse JSON response
    const parsed = JSON.parse(text);

    // Validate and clean the response
    const mapping: SplitMapping = {};
    for (const [day, muscles] of Object.entries(parsed)) {
      if (Array.isArray(muscles)) {
        mapping[day] = (muscles as string[]).filter(m =>
          VALID_MUSCLE_GROUPS.includes(m as MuscleGroup)
        ) as MuscleGroup[];
      }
    }

    console.log('[Parse Split] Result:', mapping);
    return mapping;
  } catch (error) {
    console.error('[Parse Split] AI error:', error);

    // Fallback: basic keyword matching
    const mapping: SplitMapping = {};
    for (const day of splitDays) {
      mapping[day] = fallbackParseSplitDay(day);
    }
    return mapping;
  }
}

// Fallback keyword-based parsing
function fallbackParseSplitDay(day: string): MuscleGroup[] {
  const lower = day.toLowerCase();
  const muscles: MuscleGroup[] = [];

  if (lower.includes('chest') || lower.includes('pec')) muscles.push('chest');
  if (lower.includes('front delt') || lower.includes('front_delt')) muscles.push('front_delt');
  if (lower.includes('side delt') || lower.includes('side_delt') || lower.includes('lateral')) muscles.push('side_delt');
  if (lower.includes('rear delt') || lower.includes('rear_delt') || lower.includes('posterior')) muscles.push('rear_delt');
  if (lower.includes('shoulder') && muscles.length === 0) {
    muscles.push('front_delt', 'side_delt', 'rear_delt');
  }
  if (lower.includes('lat') || lower.includes('pull')) muscles.push('lats');
  if (lower.includes('back') && !muscles.includes('lats')) {
    muscles.push('lats', 'upper_back');
  }
  if (lower.includes('upper back') || lower.includes('row') || lower.includes('trap')) muscles.push('upper_back');
  if (lower.includes('bicep') || lower.includes('curl')) muscles.push('biceps');
  if (lower.includes('tricep') || lower.includes('pushdown')) muscles.push('triceps');
  if (lower.includes('arm') && !muscles.includes('biceps')) {
    muscles.push('biceps', 'triceps');
  }
  if (lower.includes('quad') || lower.includes('squat') || lower.includes('leg press')) muscles.push('quads');
  if (lower.includes('hamstring') || lower.includes('rdl')) muscles.push('hamstrings');
  if (lower.includes('glute') || lower.includes('hip')) muscles.push('glutes');
  if (lower.includes('calf') || lower.includes('calves')) muscles.push('calves');
  if (lower.includes('leg') && muscles.length === 0) {
    muscles.push('quads', 'hamstrings', 'glutes', 'calves');
  }
  if (lower.includes('core') || lower.includes('ab')) muscles.push('core');

  // Push day
  if (lower.includes('push') && muscles.length === 0) {
    muscles.push('chest', 'front_delt', 'triceps');
  }
  // Pull day
  if (lower.includes('pull') && muscles.length === 0) {
    muscles.push('lats', 'upper_back', 'rear_delt', 'biceps');
  }
  // Upper day
  if (lower.includes('upper') && muscles.length === 0) {
    muscles.push('chest', 'front_delt', 'side_delt', 'rear_delt', 'lats', 'upper_back', 'biceps', 'triceps');
  }
  // Lower day
  if (lower.includes('lower') && muscles.length === 0) {
    muscles.push('quads', 'hamstrings', 'glutes', 'calves');
  }

  // Add core to leg days
  if ((muscles.includes('quads') || muscles.includes('hamstrings')) && !muscles.includes('core')) {
    muscles.push('core');
  }

  return muscles.length > 0 ? muscles : ['other' as MuscleGroup];
}
