import Anthropic from '@anthropic-ai/sdk';
import { AI_MODELS, AI_TOKEN_LIMITS } from '@/lib/constants';
import { createClient } from '@/lib/supabase/server';

interface ParseRequest {
  userResponse: string;
  alreadyHave: string[]; // Fields we already have, so don't need to extract
}

interface ParseResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

const EXTRACT_ALL_PROMPT = `You are parsing a fitness onboarding response. Extract ALL relevant information you can find.

Return a JSON object with any of these fields that are mentioned or implied:

{
  "name": "string - user's preferred name/nickname",
  "age": number,
  "height_inches": number,
  "weight_lbs": number,
  "goal": "bulking" | "cutting" | "maintaining",
  "coaching_mode": "full" | "assist",
  "training_split": "PPL" | "Upper/Lower" | "Bro Split" | "Full Body" | "Custom",
  "split_rotation": ["array", "of", "days"],
  "days_per_week": number,
  "injuries": "string description or 'none'"
}

ONLY include fields that are clearly stated or strongly implied. Don't guess.

Field extraction rules:
- name: Handle "call me X", "i'm X", "X here", or just a name
- height: Convert to inches. "5'10" = 70, "178cm" = 70 (cm/2.54)
- weight: Convert to lbs. "82kg" = 181 (kg*2.2)
- goal: "bulk/gain muscle/get bigger" = bulking, "cut/lose fat/lean out" = cutting, "maintain/recomp" = maintaining
- coaching_mode: "guide me/build program/need help" = full, "have my own/following a program" = assist
- training_split: "ppl/push pull legs" = PPL, "upper lower" = Upper/Lower, "bro split" = Bro Split, "full body" = Full Body
- split_rotation: PPL = ["Push","Pull","Legs","Rest","Push","Pull","Legs"], Upper/Lower = ["Upper","Lower","Rest","Upper","Lower","Rest"], etc.
- days_per_week: "3-4 times" = 4, "5x a week" = 5, "daily except weekends" = 5
- injuries: "no/none/nope/all good" = "none", otherwise describe briefly

Return ONLY the JSON object, no explanation.`;

export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: ParseRequest = await request.json();
    const { userResponse, alreadyHave } = body;

    console.log('[onboarding-parse] Response:', userResponse, 'Already have:', alreadyHave);

    if (!userResponse) {
      return Response.json({ error: 'Missing userResponse' }, { status: 400 });
    }

    // Tell the model what fields we still need
    const skipNote = alreadyHave?.length
      ? `\n\nWe already have these fields, so skip them: ${alreadyHave.join(', ')}`
      : '';

    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: AI_MODELS.COACHING,
      max_tokens: 512,
      messages: [
        { role: 'user', content: `User response: "${userResponse}"` }
      ],
      system: EXTRACT_ALL_PROMPT + skipNote,
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
