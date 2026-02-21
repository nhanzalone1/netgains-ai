import Anthropic from '@anthropic-ai/sdk';
import { AI_MODELS } from '@/lib/constants';
import { createClient } from '@/lib/supabase/server';

interface ParseRequest {
  userResponse: string;
  conversationHistory: { role: 'user' | 'assistant'; content: string }[];
  collectedData: Record<string, unknown>;
}

interface ParseResult {
  success: boolean;
  data?: Record<string, unknown>;
  coachResponse?: string;
  error?: string;
}

// Tool to extract and save onboarding data
const EXTRACT_TOOL: Anthropic.Tool = {
  name: 'save_onboarding_data',
  description: 'Save any fitness onboarding information mentioned by the user. Call this with whatever info you can extract from their message.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: "User's preferred name" },
      age: { type: 'integer', description: "Age in years" },
      height_inches: { type: 'integer', description: "Height in inches (5'10 = 70)" },
      weight_lbs: { type: 'integer', description: "Weight in lbs (82kg = 181)" },
      goal: { type: 'string', enum: ['bulking', 'cutting', 'maintaining'] },
      coaching_mode: { type: 'string', enum: ['full', 'assist'], description: "full = build their program, assist = they have their own" },
      training_split: { type: 'string', enum: ['PPL', 'Upper/Lower', 'Bro Split', 'Full Body', 'Custom'] },
      split_rotation: { type: 'array', items: { type: 'string' }, description: "Weekly rotation like ['Push','Pull','Legs','Rest','Push','Pull','Legs']" },
      days_per_week: { type: 'integer', description: "Training days per week" },
      injuries: { type: 'string', description: "Injuries or 'none'" }
    },
    required: []
  }
};

function buildSystemPrompt(collectedData: Record<string, unknown>): string {
  const collected = Object.entries(collectedData)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(', ');

  const missing: string[] = [];
  if (!collectedData.name) missing.push('name');
  if (!collectedData.age || !collectedData.height_inches || !collectedData.weight_lbs) missing.push('age/height/weight');
  if (!collectedData.goal) missing.push('goal (bulking/cutting/maintaining)');
  if (!collectedData.coaching_mode) missing.push('whether they want you to build their program or have their own');
  if (!collectedData.training_split) missing.push('training split');
  if (!collectedData.days_per_week) missing.push('days per week they train');
  if (!collectedData.injuries) missing.push('injuries');

  return `You are an AI fitness coach doing onboarding. You're casual, direct, and talk like a real trainer texting.

${collected ? `Already collected: ${collected}` : 'This is the start of onboarding.'}

${missing.length > 0 ? `Still need: ${missing.join(', ')}` : 'We have everything needed!'}

Instructions:
1. Use the save_onboarding_data tool to extract ANY info from their message (name, stats, goals, etc.)
2. Then respond naturally - acknowledge what they said, and ask for ONE thing you still need
3. Keep responses short (1-2 sentences). No emojis. Lowercase casual style.
4. If they mention their split, you can infer days_per_week from it (PPL = 6 days, Upper/Lower = 4 days, etc.)
5. If they say they "have a program" or "follow X", that means coaching_mode = assist
6. If they want you to "guide them" or "build a program", that means coaching_mode = full

Be conversational, not robotic. React to what they actually said.`;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: ParseRequest = await request.json();
    const { userResponse, conversationHistory, collectedData } = body;

    console.log('[onboarding-parse] Response:', userResponse);
    console.log('[onboarding-parse] Collected so far:', collectedData);

    if (!userResponse) {
      return Response.json({ error: 'Missing userResponse' }, { status: 400 });
    }

    const anthropic = new Anthropic();

    // Build messages with conversation history
    const messages: Anthropic.MessageParam[] = [
      ...(conversationHistory || []).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      })),
      { role: 'user' as const, content: userResponse }
    ];

    const response = await anthropic.messages.create({
      model: AI_MODELS.COACHING,
      max_tokens: 1024,
      system: buildSystemPrompt(collectedData || {}),
      tools: [EXTRACT_TOOL],
      messages,
    });

    console.log('[onboarding-parse] AI response:', JSON.stringify(response.content));

    // Extract data from tool call (if any)
    let extracted: Record<string, unknown> = {};
    const toolUse = response.content.find(block => block.type === 'tool_use');
    if (toolUse && toolUse.type === 'tool_use') {
      const rawExtracted = toolUse.input as Record<string, unknown>;
      // Filter out empty values
      for (const [key, value] of Object.entries(rawExtracted)) {
        if (value !== null && value !== undefined && value !== '') {
          extracted[key] = value;
        }
      }
      console.log('[onboarding-parse] Extracted data:', extracted);
    }

    // Get the text response
    let coachResponse = '';
    const textBlock = response.content.find(block => block.type === 'text');
    if (textBlock && textBlock.type === 'text') {
      coachResponse = textBlock.text;
    }

    // If model used tool but didn't give text, we need to continue the conversation
    if (!coachResponse && toolUse) {
      // Send tool result and get the actual response
      const followUp = await anthropic.messages.create({
        model: AI_MODELS.COACHING,
        max_tokens: 512,
        system: buildSystemPrompt({ ...collectedData, ...extracted }),
        tools: [EXTRACT_TOOL],
        messages: [
          ...messages,
          { role: 'assistant' as const, content: response.content },
          { role: 'user' as const, content: [{ type: 'tool_result' as const, tool_use_id: toolUse.id, content: 'saved' }] }
        ],
      });

      const followUpText = followUp.content.find(block => block.type === 'text');
      if (followUpText && followUpText.type === 'text') {
        coachResponse = followUpText.text;
      }
    }

    return Response.json({
      success: true,
      data: extracted,
      coachResponse
    } satisfies ParseResult);
  } catch (error) {
    console.error('[onboarding-parse] Unexpected error:', error);
    return Response.json({ success: false, error: 'Parse failed' }, { status: 500 });
  }
}
