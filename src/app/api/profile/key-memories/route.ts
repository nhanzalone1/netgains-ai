import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { KeyMemories } from '@/lib/supabase/types';

const DEFAULT_KEY_MEMORIES: KeyMemories = {
  supplements: '',
  food_available: '',
  preferences: '',
  injuries: '',
};

// GET: Fetch current key_memories for authenticated user
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('key_memories')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('[Key Memories] Fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch key memories' }, { status: 500 });
  }

  // Return existing key_memories or default empty structure
  const keyMemories = profile?.key_memories || DEFAULT_KEY_MEMORIES;

  return NextResponse.json({ key_memories: keyMemories });
}

// PUT: Update individual key_memories fields (partial update)
export async function PUT(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let updates: Partial<KeyMemories>;
  try {
    updates = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validate that only valid fields are being updated
  const validFields: (keyof KeyMemories)[] = ['supplements', 'food_available', 'preferences', 'injuries'];
  const filteredUpdates: Partial<KeyMemories> = {};

  for (const field of validFields) {
    if (field in updates) {
      const value = updates[field];
      if (typeof value === 'string') {
        filteredUpdates[field] = value;
      }
    }
  }

  if (Object.keys(filteredUpdates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  // Get current key_memories
  const { data: profile } = await supabase
    .from('profiles')
    .select('key_memories')
    .eq('id', user.id)
    .maybeSingle();

  const currentMemories = (profile?.key_memories as KeyMemories | null) || DEFAULT_KEY_MEMORIES;

  // Merge updates with existing values
  const updatedMemories: KeyMemories = {
    ...currentMemories,
    ...filteredUpdates,
  };

  // Update in database
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ key_memories: updatedMemories })
    .eq('id', user.id);

  if (updateError) {
    console.error('[Key Memories] Update error:', updateError);
    return NextResponse.json({ error: 'Failed to update key memories' }, { status: 500 });
  }

  return NextResponse.json({ key_memories: updatedMemories, success: true });
}
