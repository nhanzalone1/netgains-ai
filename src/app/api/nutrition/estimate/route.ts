import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const { foodDescription } = await req.json();

  if (!foodDescription || typeof foodDescription !== 'string') {
    return Response.json({ error: 'Food description required' }, { status: 400 });
  }

  // Verify user is authenticated
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const anthropic = new Anthropic();

    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `Estimate the nutritional information for: "${foodDescription}"

Return ONLY a JSON object with these exact fields (numbers only, no units):
{
  "food_name": "cleaned up food name",
  "calories": number,
  "protein": number (grams),
  "carbs": number (grams),
  "fat": number (grams),
  "serving_size": "serving description"
}

Be realistic with portions. If no quantity specified, assume a typical single serving.
Return ONLY the JSON, no explanation.`
        }
      ]
    });

    // Extract the text response
    const textBlock = response.content.find(block => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return Response.json({ error: 'Failed to get estimate' }, { status: 500 });
    }

    // Parse the JSON response
    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ error: 'Invalid response format' }, { status: 500 });
    }

    const estimate = JSON.parse(jsonMatch[0]);

    return Response.json({
      food_name: estimate.food_name || foodDescription,
      calories: Math.round(estimate.calories) || 0,
      protein: Math.round(estimate.protein) || 0,
      carbs: Math.round(estimate.carbs) || 0,
      fat: Math.round(estimate.fat) || 0,
      serving_size: estimate.serving_size || '',
    });
  } catch (error) {
    console.error('Nutrition estimate error:', error);
    return Response.json({ error: 'Failed to estimate nutrition' }, { status: 500 });
  }
}
