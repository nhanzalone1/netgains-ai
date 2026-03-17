import { createClient } from '@/lib/supabase/server';
import { getMemoryIndex, isPineconeAvailable, getPineconeClient } from '@/lib/pinecone';
import { MEMORY_CATEGORIES, MemoryCategory } from '@/lib/constants';

interface MemoryItem {
  id: string;
  fact: string;
  category: MemoryCategory | 'saved';
  importance: number;
  extracted_at: string;
}

interface SavedItem {
  id: string;
  key: string;
  value: string;
  label: string;
  updated_at: string;
}

// Map coach_memory keys to user-friendly labels
const SAVED_ITEM_LABELS: Record<string, string> = {
  food_staples: 'Food Staples',
  split_rotation: 'Training Split',
  name: 'Name',
  age: 'Age',
  sex: 'Sex',
  training_experience: 'Training Experience',
  gym_equipment: 'Gym Equipment',
};

// Only show these specific keys that are meaningful to users
const ALLOWED_KEYS = [
  'food_staples',
  'split_rotation',
  'name',
  'age',
  'sex',
  'training_experience',
  'gym_equipment',
  'injuries',
  'preferences',
  'schedule',
];

export async function GET(req: Request) {
  console.log('[Memory List] Request received');

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Memory List] Querying for user_id:', user.id);

  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category') as MemoryCategory | 'saved' | null;
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 100);

  // Fetch coach_memory items (saved data like food_staples, split_rotation)
  const { data: coachMemoryData } = await supabase
    .from('coach_memory')
    .select('id, key, value, updated_at')
    .eq('user_id', user.id);

  const savedItems: SavedItem[] = (coachMemoryData || [])
    .filter(item => ALLOWED_KEYS.includes(item.key))
    .map(item => ({
      id: `saved-${item.id}`,
      key: item.key,
      value: item.value,
      label: SAVED_ITEM_LABELS[item.key] || item.key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      updated_at: item.updated_at,
    }));

  // If only asking for saved items, return early
  if (category === 'saved') {
    return Response.json({
      memories: [],
      savedItems,
      total: savedItems.length,
      categories: { saved: savedItems.length },
    });
  }

  // Check Pinecone availability
  const pineconeAvailable = await isPineconeAvailable();
  if (!pineconeAvailable) {
    console.log('[Memory List] Pinecone unavailable, returning saved items only');
    return Response.json({
      memories: [],
      savedItems,
      total: savedItems.length,
      categories: { saved: savedItems.length },
    });
  }

  try {
    const pc = getPineconeClient();
    const index = getMemoryIndex();

    // Build filter
    const filter: Record<string, unknown> = { user_id: { $eq: user.id } };
    if (category && MEMORY_CATEGORIES.includes(category as MemoryCategory)) {
      filter.category = { $eq: category };
    }

    // Generate a generic embedding to query all memories
    // Using a fitness-related phrase to get broad matches
    const embeddingResponse = await pc.inference.embed({
      model: 'llama-text-embed-v2',
      inputs: ['fitness training nutrition health wellness workout exercise'],
      parameters: { inputType: 'query' }
    });

    // Validate embedding response
    const queryEmbedding = embeddingResponse?.data?.[0]?.values;
    if (!queryEmbedding || !Array.isArray(queryEmbedding)) {
      console.error('[Memory List] Failed to generate query embedding, response:', JSON.stringify(embeddingResponse).substring(0, 200));
      return Response.json({
        memories: [],
        savedItems,
        total: savedItems.length,
        categories: { saved: savedItems.length },
      });
    }

    // Query with high topK to get all user memories
    // The metadata filter will ensure we only get this user's memories
    const results = await index.query({
      vector: queryEmbedding,
      topK: limit,
      filter,
      includeMetadata: true,
    });

    console.log('[Memory List] Pinecone returned', results.matches?.length || 0, 'matches');
    if (results.matches && results.matches.length > 0) {
      console.log('[Memory List] First match:', JSON.stringify(results.matches[0]).substring(0, 500));
    }

    const memories: MemoryItem[] = (results.matches || [])
      .map(match => ({
        id: match.id,
        fact: (match.metadata?.fact as string) || '',
        category: (match.metadata?.category as MemoryCategory) || 'history',
        importance: (match.metadata?.importance as number) || 3,
        extracted_at: (match.metadata?.extracted_at as string) || '',
      }))
      .filter(m => m.fact) // Remove empty facts
      .sort((a, b) => {
        // Sort by importance first, then by date
        if (a.importance !== b.importance) {
          return b.importance - a.importance;
        }
        return new Date(b.extracted_at).getTime() - new Date(a.extracted_at).getTime();
      });

    // Count by category (from the filtered results)
    const categoryCounts: Record<string, number> = { saved: savedItems.length };
    for (const cat of MEMORY_CATEGORIES) {
      categoryCounts[cat] = memories.filter(m => m.category === cat).length;
    }

    console.log('[Memory List] Found', memories.length, 'memories and', savedItems.length, 'saved items for user');

    return Response.json({
      memories,
      savedItems,
      total: memories.length + savedItems.length,
      categories: categoryCounts,
    });
  } catch (error) {
    console.error('[Memory List] Error:', error);
    return Response.json({
      memories: [],
      savedItems,
      total: savedItems.length,
      categories: { saved: savedItems.length },
    });
  }
}
