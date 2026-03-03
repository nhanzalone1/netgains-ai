import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { AI_MODELS, AI_TOKEN_LIMITS } from '@/lib/constants';

export async function POST(req: Request) {
  const { foodDescription, servingSize } = await req.json();

  if (!foodDescription || typeof foodDescription !== 'string') {
    return Response.json({ error: 'Food description required' }, { status: 400 });
  }

  // If user provided a serving size, include it in the description
  const hasUserServing = servingSize && typeof servingSize === 'string' && servingSize.trim();
  const fullDescription = hasUserServing
    ? `${foodDescription} (serving size: ${servingSize.trim()})`
    : foodDescription;

  // Verify user is authenticated
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const anthropic = new Anthropic();

    // USDA reference values for deterministic calculations
    const usdaReference = `USDA STANDARD VALUES (per 100g raw unless noted):
- Chicken breast: 31g protein, 3.6g fat, 0g carbs, 165 cal
- Chicken thigh: 26g protein, 10g fat, 0g carbs, 209 cal
- Beef (93% lean): 26g protein, 7g fat, 0g carbs, 170 cal
- Salmon: 20g protein, 13g fat, 0g carbs, 208 cal
- Eggs (1 large = 50g): 6g protein, 5g fat, 0.6g carbs, 72 cal
- Rice (cooked): 2.7g protein, 0.3g fat, 28g carbs, 130 cal
- Oats (dry): 13g protein, 7g fat, 66g carbs, 389 cal
- Whole milk: 3.3g protein, 3.3g fat, 4.8g carbs, 61 cal
- Greek yogurt: 10g protein, 0.7g fat, 3.6g carbs, 59 cal
- Whey protein (1 scoop = 30g): 24g protein, 1g fat, 2g carbs, 120 cal
- Bread (1 slice = 30g): 3g protein, 1g fat, 13g carbs, 75 cal
- Banana (1 medium = 120g): 1.3g protein, 0.4g fat, 27g carbs, 105 cal
- Apple (1 medium = 180g): 0.5g protein, 0.3g fat, 25g carbs, 95 cal

Calculate EXACTLY from these values. Scale linearly based on weight.`;

    const prompt = hasUserServing
      ? `Calculate the nutritional information for: "${fullDescription}"

The user has specified a serving size of "${servingSize.trim()}". Calculate macros for EXACTLY that amount.

${usdaReference}

Return ONLY a JSON object with these exact fields (numbers only, no units):
{
  "food_name": "cleaned up food name",
  "calories": number,
  "protein": number (grams),
  "carbs": number (grams),
  "fat": number (grams)
}

Use USDA values. Calculate exactly — do not estimate or round loosely. Return ONLY the JSON.`
      : `Calculate the nutritional information for: "${foodDescription}"

${usdaReference}

Return ONLY a JSON object with these exact fields (numbers only, no units):
{
  "food_name": "cleaned up food name",
  "calories": number,
  "protein": number (grams),
  "carbs": number (grams),
  "fat": number (grams),
  "serving_size": "serving description"
}

Use USDA values. If no quantity specified, assume a typical single serving. Calculate exactly — do not estimate or round loosely. Return ONLY the JSON.`;

    const response = await anthropic.messages.create({
      model: AI_MODELS.NUTRITION_ESTIMATE,
      max_tokens: AI_TOKEN_LIMITS.NUTRITION_ESTIMATE,
      temperature: 0, // Deterministic output for consistent macro values
      messages: [{ role: 'user', content: prompt }]
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
