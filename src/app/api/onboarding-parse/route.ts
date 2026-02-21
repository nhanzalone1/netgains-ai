import Anthropic from '@anthropic-ai/sdk';
import { AI_MODELS } from '@/lib/constants';
import { createClient } from '@/lib/supabase/server';

interface ParseRequest {
  userResponse: string;
  alreadyHave: string[];
}

interface ParseResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

// Tool definition with strict schema - forces structured output
const EXTRACT_TOOL: Anthropic.Tool = {
  name: 'extract_onboarding_data',
  description: 'Extract fitness onboarding information from user response. Only include fields that are clearly stated or strongly implied.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: "User's preferred name/nickname. Handle 'call me X', 'i'm X', or just a name."
      },
      age: {
        type: 'integer',
        description: "User's age in years."
      },
      height_inches: {
        type: 'integer',
        description: "Height in inches. Convert: 5'10 = 70, 178cm = 70 (cm/2.54)."
      },
      weight_lbs: {
        type: 'integer',
        description: "Weight in pounds. Convert: 82kg = 181 (kg*2.2)."
      },
      goal: {
        type: 'string',
        enum: ['bulking', 'cutting', 'maintaining'],
        description: "Fitness goal. bulk/gain muscle = bulking, cut/lose fat = cutting, maintain/recomp = maintaining."
      },
      coaching_mode: {
        type: 'string',
        enum: ['full', 'assist'],
        description: "Coaching preference. guide me/build program = full, have my own/following program = assist."
      },
      training_split: {
        type: 'string',
        enum: ['PPL', 'Upper/Lower', 'Bro Split', 'Full Body', 'Custom'],
        description: "Training split type."
      },
      split_rotation: {
        type: 'array',
        items: { type: 'string' },
        description: "Weekly rotation. PPL = ['Push','Pull','Legs','Rest','Push','Pull','Legs'], Upper/Lower = ['Upper','Lower','Rest','Upper','Lower','Rest'], etc."
      },
      days_per_week: {
        type: 'integer',
        description: "Training days per week. '3-4 times' = 4, '5x a week' = 5."
      },
      injuries: {
        type: 'string',
        description: "Injuries/limitations. 'no/none/nope' = 'none', otherwise brief description."
      }
    },
    required: []
  }
};

const SYSTEM_PROMPT = `You are parsing fitness onboarding responses. Extract ANY relevant information from the user's message using the extract_onboarding_data tool.

Rules:
- ONLY extract fields that are clearly stated or strongly implied
- Don't guess or make up values
- Convert units to imperial (inches, lbs)
- For split_rotation, provide a realistic weekly array based on the split type
- Always call the tool, even if you only extract one field`;

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
      ? `\nWe already have: ${alreadyHave.join(', ')}. Don't extract those again.`
      : '';

    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: AI_MODELS.COACHING,
      max_tokens: 1024,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: 'tool', name: 'extract_onboarding_data' },
      messages: [
        { role: 'user', content: `${SYSTEM_PROMPT}${skipNote}\n\nUser said: "${userResponse}"` }
      ],
    });

    console.log('[onboarding-parse] AI response:', JSON.stringify(response.content));

    // Find the tool use block
    const toolUse = response.content.find(block => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      console.error('[onboarding-parse] No tool_use in response');
      return Response.json({ success: false, error: 'AI did not extract data' });
    }

    const extracted = toolUse.input as Record<string, unknown>;
    console.log('[onboarding-parse] Extracted data:', extracted);

    // Filter out empty values
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(extracted)) {
      if (value !== null && value !== undefined && value !== '') {
        cleaned[key] = value;
      }
    }

    return Response.json({ success: true, data: cleaned } satisfies ParseResult);
  } catch (error) {
    console.error('[onboarding-parse] Unexpected error:', error);
    return Response.json({ success: false, error: 'Parse failed' }, { status: 500 });
  }
}
