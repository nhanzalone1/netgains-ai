import { createClient } from '@/lib/supabase/server';
import { MUSCLE_GROUPS, type MuscleGroup } from '@/lib/supabase/types';

// GET /api/split-muscle-groups
// Get all split mappings for user, or specific folder with ?folderId=xxx
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('folderId');

    let query = supabase
      .from('split_muscle_groups')
      .select('*')
      .eq('user_id', user.id);

    if (folderId) {
      query = query.eq('folder_id', folderId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Split Muscle Groups] GET error:', error);
      return Response.json({ error: 'Failed to fetch split mappings' }, { status: 500 });
    }

    return Response.json({ data });
  } catch (error) {
    console.error('[Split Muscle Groups] Unexpected error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/split-muscle-groups
// Create or update a split mapping (upsert)
// Body: { folderId: string, muscleGroups: string[] }
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { folderId, muscleGroups } = await request.json();

    if (!folderId || typeof folderId !== 'string') {
      return Response.json({ error: 'folderId is required' }, { status: 400 });
    }

    if (!Array.isArray(muscleGroups)) {
      return Response.json({ error: 'muscleGroups must be an array' }, { status: 400 });
    }

    // Validate muscle groups
    const validMuscleGroups = muscleGroups.filter(
      (mg: string) => MUSCLE_GROUPS.includes(mg as MuscleGroup)
    );

    if (validMuscleGroups.length !== muscleGroups.length) {
      const invalid = muscleGroups.filter(
        (mg: string) => !MUSCLE_GROUPS.includes(mg as MuscleGroup)
      );
      return Response.json(
        { error: `Invalid muscle groups: ${invalid.join(', ')}` },
        { status: 400 }
      );
    }

    // Verify folder exists and belongs to user
    const { data: folder, error: folderError } = await supabase
      .from('folders')
      .select('id')
      .eq('id', folderId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (folderError || !folder) {
      return Response.json({ error: 'Folder not found' }, { status: 404 });
    }

    // Upsert the mapping
    const { data, error } = await supabase
      .from('split_muscle_groups')
      .upsert(
        {
          user_id: user.id,
          folder_id: folderId,
          muscle_groups: validMuscleGroups,
        },
        { onConflict: 'folder_id' }
      )
      .select()
      .single();

    if (error) {
      console.error('[Split Muscle Groups] POST error:', error);
      return Response.json({ error: 'Failed to save split mapping' }, { status: 500 });
    }

    return Response.json({ data });
  } catch (error) {
    console.error('[Split Muscle Groups] Unexpected error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/split-muscle-groups?folderId=xxx
// Delete a split mapping
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('folderId');

    if (!folderId) {
      return Response.json({ error: 'folderId is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('split_muscle_groups')
      .delete()
      .eq('folder_id', folderId)
      .eq('user_id', user.id);

    if (error) {
      console.error('[Split Muscle Groups] DELETE error:', error);
      return Response.json({ error: 'Failed to delete split mapping' }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('[Split Muscle Groups] Unexpected error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
