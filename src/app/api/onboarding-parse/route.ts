import Anthropic from '@anthropic-ai/sdk';
import { AI_MODELS, AI_TOKEN_LIMITS } from '@/lib/constants';
import { createClient } from '@/lib/supabase/server';

// Define what each step extracts
type StepType = 'name' | 'stats' | 'goal' | 'coaching_mode' | 'split' | 'days' | 'injuries';

interface ParseRequest {
  step: StepType;
  userResponse: string;
  context?: Record<string, string>; // Previous answers for context
}

interface ParseResult {
  success: boolean;
  data?: Record<string, string | number>;
  error?: string;
}

const STEP_PROMPTS: Record<StepType, string> = {
  name: `Extract the user's preferred name from their response.
Return JSON: {"name": "extracted name"}
If unclear, use the most name-like word. Handle casual responses like "just call me X" or "i'm X" or "X here".`,

  stats: `Extract age, height, and weight from the user's response.
Return JSON: {"age": number, "height_inches": number, "weight_lbs": number}

Height can be given as:
- "5'10" or "5 foot 10" = 70 inches
- "5'10 and a half" = 70 inches (round)
- "70 inches" = 70 inches
- "178 cm" = 70 inches (convert: cm / 2.54)

Weight can be given as:
- "180" or "180 lbs" = 180
- "82 kg" = 181 (convert: kg * 2.2)

If user gives height in cm or weight in kg, convert to imperial.
Age must be a number. If unclear, make your best guess from context.`,

  goal: `Extract the user's fitness goal from their response.
Return JSON: {"goal": "bulking" | "cutting" | "maintaining"}

Map user language:
- "bulk", "gain muscle", "get bigger", "put on size", "gain weight" = "bulking"
- "cut", "lose fat", "lean out", "shred", "lose weight", "get lean" = "cutting"
- "maintain", "stay same", "recomp", "stay where I am" = "maintaining"

Pick the closest match.`,

  coaching_mode: `Extract whether the user wants full coaching or just assistance.
Return JSON: {"coaching_mode": "full" | "assist"}

Map user language:
- "guide me", "build program", "tell me what to do", "don't have one", "need help" = "full"
- "have my own", "following a program", "just track", "already have one", "assist" = "assist"

Pick the closest match.`,

  split: `Extract the user's training split from their response.
Return JSON: {"training_split": "PPL" | "Upper/Lower" | "Bro Split" | "Full Body" | "Custom", "split_rotation": string[]}

Common mappings:
- "ppl", "push pull legs" = PPL with rotation ["Push", "Pull", "Legs", "Rest", "Push", "Pull", "Legs"]
- "upper lower", "upper/lower" = Upper/Lower with rotation ["Upper", "Lower", "Rest", "Upper", "Lower", "Rest"]
- "bro split", "one muscle per day" = Bro Split with rotation ["Chest", "Back", "Shoulders", "Arms", "Legs", "Rest", "Rest"]
- "full body" = Full Body with rotation ["Full Body", "Rest", "Full Body", "Rest", "Full Body", "Rest"]

If they describe something custom, set training_split to "Custom" and create an appropriate rotation array.`,

  days: `Extract how many days per week the user can train.
Return JSON: {"days_per_week": number}

Handle casual responses like "3-4 times", "every other day" (= 3-4), "5x a week", "daily except weekends" (= 5).
Return a single number, not a range. If they say a range like "3-4", pick the higher number.`,

  injuries: `Extract any injuries or limitations from the user's response.
Return JSON: {"injuries": "description or none"}

If user says "no", "none", "nope", "all good", "nothing", etc., return {"injuries": "none"}.
Otherwise, extract a brief description of their injury/limitation.`,
};

export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: ParseRequest = await request.json();
    const { step, userResponse, context } = body;

    console.log('[onboarding-parse] Step:', step, 'Response:', userResponse);

    if (!step || !userResponse) {
      return Response.json({ error: 'Missing step or userResponse' }, { status: 400 });
    }

    const stepPrompt = STEP_PROMPTS[step];
    if (!stepPrompt) {
      return Response.json({ error: 'Invalid step' }, { status: 400 });
    }

    // Build context string if available
    let contextStr = '';
    if (context && Object.keys(context).length > 0) {
      contextStr = `\n\nPrevious answers for context:\n${JSON.stringify(context, null, 2)}`;
    }

    const systemPrompt = `You are a parser extracting structured data from casual fitness onboarding responses.
Always return valid JSON matching the requested format. Be flexible with user language.${contextStr}

${stepPrompt}`;

    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: AI_MODELS.COACHING,
      max_tokens: AI_TOKEN_LIMITS.ONBOARDING_PARSE,
      messages: [
        { role: 'user', content: `User response: "${userResponse}"` }
      ],
      system: systemPrompt,
    });

    console.log('[onboarding-parse] AI response:', JSON.stringify(response.content));

    // Extract text from response
    const textBlock = response.content.find(block => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      console.error('[onboarding-parse] No text block in response');
      return Response.json({ success: false, error: 'No response from AI' });
    }

    console.log('[onboarding-parse] Raw text:', textBlock.text);

    // Parse JSON from response
    let parsed: Record<string, string | number>;
    try {
      // Try to extract JSON from the response (might have extra text)
      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      parsed = JSON.parse(jsonMatch[0]);
      console.log('[onboarding-parse] Parsed data:', parsed);
    } catch (parseError) {
      console.error('[onboarding-parse] JSON parse error:', parseError, 'Raw:', textBlock.text);
      return Response.json({ success: false, error: 'Failed to parse AI response' });
    }

    return Response.json({ success: true, data: parsed } satisfies ParseResult);
  } catch (error) {
    console.error('[onboarding-parse] Unexpected error:', error);
    return Response.json({ success: false, error: 'Parse failed' }, { status: 500 });
  }
}
