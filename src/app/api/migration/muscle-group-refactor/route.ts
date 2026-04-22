import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { MUSCLE_GROUPS, type MuscleGroup, isGymSpecificEquipment } from '@/lib/supabase/types';

// Service role client for migration operations
function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Map old muscle group values to new values
function migrateOldMuscleGroup(oldGroup: string): string {
  const mapping: Record<string, string> = {
    'lats': 'back',
    'upper_back': 'back',
    'core': 'abs',
  };
  return mapping[oldGroup] || oldGroup;
}

// Parse split day names into muscle groups (simplified fallback)
function parseSplitDayName(name: string): MuscleGroup[] {
  const lower = name.toLowerCase();
  const muscles: MuscleGroup[] = [];

  // Direct matches
  if (lower.includes('chest') || lower.includes('pec')) muscles.push('chest');
  if (lower.includes('back') || lower.includes('lat') || lower.includes('row')) {
    if (!muscles.includes('back')) muscles.push('back');
  }
  if (lower.includes('bicep')) muscles.push('biceps');
  if (lower.includes('tricep')) muscles.push('triceps');
  if (lower.includes('front delt') || lower.includes('front_delt')) muscles.push('front_delt');
  if (lower.includes('side delt') || lower.includes('side_delt') || lower.includes('lateral delt')) muscles.push('side_delt');
  if (lower.includes('rear delt') || lower.includes('rear_delt')) muscles.push('rear_delt');
  if (lower.includes('shoulder') && muscles.filter(m => m.includes('delt')).length === 0) {
    muscles.push('front_delt', 'side_delt', 'rear_delt');
  }
  if (lower.includes('quad') || lower.includes('squat')) muscles.push('quads');
  if (lower.includes('hamstring') || lower.includes('rdl')) muscles.push('hamstrings');
  if (lower.includes('glute') || lower.includes('hip thrust')) muscles.push('glutes');
  if (lower.includes('calf') || lower.includes('calves')) muscles.push('calves');
  if (lower.includes('ab') || lower.includes('core')) muscles.push('abs');
  if (lower.includes('forearm') || lower.includes('grip')) muscles.push('forearms');

  // Common split patterns
  if (lower.includes('push') && muscles.length === 0) {
    muscles.push('chest', 'front_delt', 'triceps');
  }
  if (lower.includes('pull') && muscles.length === 0) {
    muscles.push('back', 'rear_delt', 'biceps');
  }
  if (lower.includes('leg') && muscles.length === 0) {
    muscles.push('quads', 'hamstrings', 'glutes', 'calves');
  }
  if (lower.includes('upper') && muscles.length === 0) {
    muscles.push('chest', 'back', 'front_delt', 'side_delt', 'rear_delt', 'biceps', 'triceps');
  }
  if (lower.includes('lower') && muscles.length === 0) {
    muscles.push('quads', 'hamstrings', 'glutes', 'calves');
  }
  if (lower.includes('arm') && !muscles.includes('biceps')) {
    muscles.push('biceps', 'triceps');
  }

  // Add abs to leg days
  if (muscles.includes('quads') && !muscles.includes('abs')) {
    muscles.push('abs');
  }

  return muscles;
}

// POST /api/migration/muscle-group-refactor
// Run the data migration for a specific user
// Body: { preview?: boolean } - if true, returns what would be changed without making changes
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { preview = false } = await request.json().catch(() => ({}));

    const adminClient = getSupabaseAdmin();
    const results = {
      exerciseTemplatesUpdated: 0,
      exercisesUpdated: 0,
      splitMappingsCreated: 0,
      muscleGroupsMigrated: 0,
      gymIdsPopulated: 0,
      isGymSpecificSet: 0,
      errors: [] as string[],
      preview,
    };

    // Step 1: Get all folders with their locations for this user
    const { data: folders, error: foldersError } = await adminClient
      .from('folders')
      .select('id, name, location_id')
      .eq('user_id', user.id);

    if (foldersError) {
      results.errors.push(`Failed to fetch folders: ${foldersError.message}`);
    }

    // Step 2: Create split_muscle_groups mappings for each folder
    if (folders && folders.length > 0 && !preview) {
      for (const folder of folders) {
        const muscleGroups = parseSplitDayName(folder.name);

        if (muscleGroups.length > 0) {
          const { error } = await adminClient
            .from('split_muscle_groups')
            .upsert(
              {
                user_id: user.id,
                folder_id: folder.id,
                muscle_groups: muscleGroups,
              },
              { onConflict: 'folder_id' }
            );

          if (error) {
            results.errors.push(`Failed to create mapping for ${folder.name}: ${error.message}`);
          } else {
            results.splitMappingsCreated++;
          }
        }
      }
    } else if (folders) {
      // Preview mode - just count
      for (const folder of folders) {
        const muscleGroups = parseSplitDayName(folder.name);
        if (muscleGroups.length > 0) {
          results.splitMappingsCreated++;
        }
      }
    }

    // Step 3: Update exercise_templates
    const { data: templates, error: templatesError } = await adminClient
      .from('exercise_templates')
      .select('id, folder_id, equipment, muscle_group, gym_id, is_gym_specific')
      .eq('user_id', user.id);

    if (templatesError) {
      results.errors.push(`Failed to fetch exercise templates: ${templatesError.message}`);
    }

    // Build folder_id → location_id map
    const folderLocationMap = new Map<string, string>();
    if (folders) {
      folders.forEach(f => folderLocationMap.set(f.id, f.location_id));
    }

    if (templates && !preview) {
      for (const template of templates) {
        const updates: Record<string, unknown> = {};

        // Populate gym_id if not set
        if (!template.gym_id && folderLocationMap.has(template.folder_id)) {
          updates.gym_id = folderLocationMap.get(template.folder_id);
          results.gymIdsPopulated++;
        }

        // Set is_gym_specific based on equipment
        if (template.is_gym_specific === null || template.is_gym_specific === undefined) {
          updates.is_gym_specific = isGymSpecificEquipment(template.equipment);
          results.isGymSpecificSet++;
        }

        // Migrate muscle_group values
        if (template.muscle_group && Array.isArray(template.muscle_group)) {
          const migrated = template.muscle_group.map(migrateOldMuscleGroup);
          const unique = [...new Set(migrated)].filter(mg => MUSCLE_GROUPS.includes(mg as MuscleGroup));

          if (JSON.stringify(unique) !== JSON.stringify(template.muscle_group)) {
            updates.muscle_group = unique;
            results.muscleGroupsMigrated++;
          }
        }

        if (Object.keys(updates).length > 0) {
          const { error } = await adminClient
            .from('exercise_templates')
            .update(updates)
            .eq('id', template.id);

          if (error) {
            results.errors.push(`Failed to update template ${template.id}: ${error.message}`);
          } else {
            results.exerciseTemplatesUpdated++;
          }
        }
      }
    } else if (templates) {
      // Preview mode
      for (const template of templates) {
        let wouldUpdate = false;

        if (!template.gym_id && folderLocationMap.has(template.folder_id)) {
          results.gymIdsPopulated++;
          wouldUpdate = true;
        }
        if (template.is_gym_specific === null || template.is_gym_specific === undefined) {
          results.isGymSpecificSet++;
          wouldUpdate = true;
        }
        if (template.muscle_group && Array.isArray(template.muscle_group)) {
          const migrated = template.muscle_group.map(migrateOldMuscleGroup);
          const unique = [...new Set(migrated)];
          if (JSON.stringify(unique) !== JSON.stringify(template.muscle_group)) {
            results.muscleGroupsMigrated++;
            wouldUpdate = true;
          }
        }
        if (wouldUpdate) results.exerciseTemplatesUpdated++;
      }
    }

    // Step 4: Update logged exercises (for PR tracking)
    // For now, we'll just count how many need updating
    // Actual gym_id will be set when workouts are logged going forward
    const { data: exercises, error: exercisesError } = await adminClient
      .from('exercises')
      .select(`
        id,
        equipment,
        gym_id,
        is_gym_specific,
        workouts!inner (user_id)
      `)
      .eq('workouts.user_id', user.id);

    if (exercisesError) {
      results.errors.push(`Failed to fetch exercises: ${exercisesError.message}`);
    }

    if (exercises && !preview) {
      for (const exercise of exercises) {
        if (exercise.is_gym_specific === null || exercise.is_gym_specific === undefined) {
          const { error } = await adminClient
            .from('exercises')
            .update({ is_gym_specific: isGymSpecificEquipment(exercise.equipment) })
            .eq('id', exercise.id);

          if (!error) results.exercisesUpdated++;
        }
      }
    } else if (exercises) {
      results.exercisesUpdated = exercises.filter(
        ex => ex.is_gym_specific === null || ex.is_gym_specific === undefined
      ).length;
    }

    return Response.json({
      success: true,
      results,
      message: preview
        ? 'Preview complete. Run without preview:true to apply changes.'
        : 'Migration complete.',
    });
  } catch (error) {
    console.error('[Migration] Unexpected error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
