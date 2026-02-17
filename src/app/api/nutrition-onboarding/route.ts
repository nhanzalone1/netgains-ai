import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();

  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse request body
  const body = await request.json();
  const {
    calorieAwareness,
    statedCalories,
    trackingStyle,
    restrictions,
  } = body as {
    calorieAwareness: 'knows' | 'fresh';
    statedCalories?: number;
    trackingStyle: 'scale_app' | 'eyeballing' | 'no_tracking';
    restrictions: string;
  };

  // Fetch user profile and coach memory for calculation inputs
  const [profileResult, memoriesResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('weight_lbs, height_inches, goal')
      .eq('id', user.id)
      .single(),
    supabase
      .from('coach_memory')
      .select('key, value')
      .eq('user_id', user.id)
      .in('key', ['age', 'days_per_week']),
  ]);

  if (profileResult.error || !profileResult.data) {
    return Response.json({ error: 'Profile not found' }, { status: 404 });
  }

  const profile = profileResult.data;
  const memories = memoriesResult.data || [];
  const memoryMap: Record<string, string> = {};
  memories.forEach(m => { memoryMap[m.key] = m.value; });

  // Get values with defaults
  const weightLbs = profile.weight_lbs || 170;
  const heightInches = profile.height_inches || 70; // 5'10" default
  const age = parseInt(memoryMap.age) || 30;
  const daysPerWeek = parseInt(memoryMap.days_per_week) || 4;
  const goal = profile.goal || 'maintaining';

  // Convert to metric for Mifflin-St Jeor
  const weightKg = weightLbs * 0.453592;
  const heightCm = heightInches * 2.54;

  console.log('[Nutrition Calc] Input values:', {
    weightLbs, heightInches, age, daysPerWeek, goal,
    weightKg: weightKg.toFixed(1), heightCm: heightCm.toFixed(1)
  });

  // Mifflin-St Jeor equation (for men - using +5, women would be -161)
  // BMR = (10 × weight in kg) + (6.25 × height in cm) - (5 × age) + 5
  const bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) + 5;
  console.log('[Nutrition Calc] BMR:', Math.round(bmr));

  // Activity factor based on training days
  let activityFactor: number;
  if (daysPerWeek <= 2) {
    activityFactor = 1.375;
  } else if (daysPerWeek <= 4) {
    activityFactor = 1.55;
  } else if (daysPerWeek <= 6) {
    activityFactor = 1.725;
  } else {
    activityFactor = 1.9;
  }

  // Calculate TDEE
  const tdee = bmr * activityFactor;
  console.log('[Nutrition Calc] Activity factor:', activityFactor, 'TDEE:', Math.round(tdee));

  // Adjust for goal
  let suggestedCalories: number;
  let goalDescription: string;

  switch (goal) {
    case 'bulking':
      suggestedCalories = Math.round(tdee + 300);
      goalDescription = 'bulk';
      break;
    case 'cutting':
      suggestedCalories = Math.round(tdee - 500);
      goalDescription = 'cut';
      break;
    case 'maintaining':
    default:
      suggestedCalories = Math.round(tdee);
      goalDescription = 'maintain';
      break;
  }

  // Calculate macros
  // Protein: 1g per lb bodyweight
  const protein = Math.round(weightLbs);
  // Fat: 25% of calories ÷ 9
  const fat = Math.round((suggestedCalories * 0.25) / 9);
  // Carbs: remaining calories ÷ 4
  const carbs = Math.round((suggestedCalories - protein * 4 - fat * 9) / 4);

  console.log('[Nutrition Calc] Final targets:', {
    calories: suggestedCalories, protein, carbs, fat, goal: goalDescription
  });

  // Build personalized message
  let message: string;
  if (statedCalories && Math.abs(statedCalories - suggestedCalories) > 200) {
    message = `You mentioned eating around ${statedCalories.toLocaleString()} calories. Based on your stats and goal to ${goalDescription}, I calculated ${suggestedCalories.toLocaleString()} calories. You can use either as a starting point.`;
  } else {
    message = `Based on your stats (${weightLbs}lbs, ${Math.floor(heightInches / 12)}'${heightInches % 12}", ${daysPerWeek} training days) and goal to ${goalDescription}, here's your starting point:`;
  }

  // Save preferences to coach_memory
  const memoriesToSave = [
    { key: 'calorie_awareness', value: calorieAwareness },
    { key: 'tracking_style', value: trackingStyle },
  ];

  if (restrictions && restrictions.trim()) {
    memoriesToSave.push({ key: 'food_restrictions', value: restrictions.trim() });
  }

  // Upsert memories
  for (const memory of memoriesToSave) {
    await supabase
      .from('coach_memory')
      .upsert(
        { user_id: user.id, key: memory.key, value: memory.value },
        { onConflict: 'user_id,key' }
      );
  }

  return Response.json({
    goals: {
      calories: suggestedCalories,
      protein,
      carbs,
      fat,
    },
    userStatedCalories: statedCalories || null,
    suggestedCalories,
    message,
  });
}
