import { createClient } from '@/lib/supabase/server';
import { categorizeExercises } from '../categorize/route';

// Re-categorize all exercises for the current user
// Call this once after running the migration to add muscle_group column
export async function POST() {
  const supabase = await createClient();

  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Recategorize] Starting for user:', user.id);

  // Get all exercises for this user that need categorization
  const { data: exercises, error: fetchError } = await supabase
    .from('exercise_templates')
    .select('id, name, muscle_group')
    .eq('user_id', user.id);

  if (fetchError) {
    console.error('[Recategorize] Fetch error:', fetchError);
    return Response.json({ error: 'Failed to fetch exercises' }, { status: 500 });
  }

  if (!exercises || exercises.length === 0) {
    return Response.json({ message: 'No exercises to categorize', count: 0 });
  }

  // Filter to only exercises without a muscle_group (or recategorize all if needed)
  // Handle both old single-value format and new array format
  const needsCategorization = exercises.filter(ex =>
    !ex.muscle_group ||
    (Array.isArray(ex.muscle_group) && ex.muscle_group.length === 0)
  );

  console.log(`[Recategorize] Found ${exercises.length} exercises, ${needsCategorization.length} need categorization`);

  if (needsCategorization.length === 0) {
    return Response.json({
      message: 'All exercises already categorized',
      count: 0,
      total: exercises.length
    });
  }

  // Categorize using AI (returns only successfully categorized exercises)
  const categorized = await categorizeExercises(
    needsCategorization.map(ex => ({ id: ex.id, name: ex.name }))
  );

  const skippedCount = needsCategorization.length - categorized.length;
  console.log(`[Recategorize] AI categorization complete: ${categorized.length} categorized, ${skippedCount} could not be categorized`);

  // Update each exercise with its category
  let successCount = 0;
  let errorCount = 0;

  for (const { id, muscleGroup } of categorized) {
    // Store as array (AI returns single value, wrap it)
    const { error: updateError } = await supabase
      .from('exercise_templates')
      .update({ muscle_group: [muscleGroup] })
      .eq('id', id);

    if (updateError) {
      console.error(`[Recategorize] Failed to update exercise ${id}:`, updateError);
      errorCount++;
    } else {
      successCount++;
    }
  }

  console.log(`[Recategorize] Complete: ${successCount} updated, ${errorCount} errors`);

  // Return summary with categorization breakdown
  const breakdown: Record<string, number> = {};
  for (const { muscleGroup } of categorized) {
    breakdown[muscleGroup] = (breakdown[muscleGroup] || 0) + 1;
  }

  return Response.json({
    message: 'Recategorization complete',
    total: exercises.length,
    needsCategorization: needsCategorization.length,
    categorized: successCount,
    skipped: skippedCount,
    errors: errorCount,
    breakdown,
  });
}
