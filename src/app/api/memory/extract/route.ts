import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { getMemoryIndex, isPineconeAvailable, getPineconeClient } from '@/lib/pinecone';
import { PINECONE_CONFIG, MEMORY_CATEGORIES, MemoryCategory } from '@/lib/constants';

interface ExtractedMemory {
  fact: string;
  category: MemoryCategory;
  importance: number;
  source_text: string;
}

interface ConversationMessage {
  role: string;
  content: string;
}

export async function POST(req: Request) {
  console.log('[Memory Extract] Request received');

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    console.log('[Memory Extract] Auth failed:', authError?.message);
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Memory Extract] User:', user.id);

  let messages: ConversationMessage[];
  try {
    const body = await req.json();
    messages = body.messages;
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!messages || messages.length < 3) {
    console.log('[Memory Extract] Not enough messages:', messages?.length || 0);
    return Response.json({ error: 'Not enough messages to extract' }, { status: 400 });
  }

  // Check Pinecone availability
  const pineconeAvailable = await isPineconeAvailable();
  if (!pineconeAvailable) {
    console.error('[Memory Extract] Pinecone unavailable, skipping extraction');
    return Response.json({ success: false, reason: 'pinecone_unavailable' });
  }

  try {
    // Step 1: Extract atomic facts using Haiku
    console.log('[Memory Extract] Extracting facts from', messages.length, 'messages');
    const extractedMemories = await extractAtomicFacts(messages);
    console.log('[Memory Extract] Extracted', extractedMemories.length, 'facts');

    if (extractedMemories.length === 0) {
      return Response.json({ success: true, extracted: 0 });
    }

    // Step 2: Deduplicate against existing memories
    const newMemories = await deduplicateMemories(user.id, extractedMemories);
    console.log('[Memory Extract] After dedup:', newMemories.length, 'new memories');

    if (newMemories.length === 0) {
      return Response.json({
        success: true,
        extracted: 0,
        deduplicated: extractedMemories.length
      });
    }

    // Step 3: Generate embeddings and upsert to Pinecone
    const pc = getPineconeClient();
    const index = getMemoryIndex();
    const now = new Date().toISOString();

    // Generate embeddings for all new memories
    const factsToEmbed = newMemories.map(m => m.fact);
    const embeddingResponse = await pc.inference.embed(
      'llama-text-embed-v2',
      factsToEmbed,
      { inputType: 'passage' }
    );

    // Build vectors with metadata
    const vectors = newMemories.map((memory, i) => {
      const vectorId = `${user.id}-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`;
      const embedding = embeddingResponse.data[i]?.values;

      if (!embedding) {
        console.error('[Memory Extract] Missing embedding for index', i);
        return null;
      }

      return {
        id: vectorId,
        values: embedding,
        metadata: {
          user_id: user.id,
          category: memory.category,
          importance: memory.importance,
          fact: memory.fact,
          source_text: memory.source_text.substring(0, 500),
          extracted_at: now,
          last_accessed: now,
        },
      };
    }).filter((v): v is NonNullable<typeof v> => v !== null);

    // Upsert to Pinecone
    if (vectors.length > 0) {
      await index.upsert(vectors);
      console.log('[Memory Extract] Upserted', vectors.length, 'vectors to Pinecone');
    }

    // Step 4: Log extraction to coach_memory for debugging
    await supabase
      .from('coach_memory')
      .upsert({
        user_id: user.id,
        key: 'last_memory_extraction',
        value: JSON.stringify({
          timestamp: now,
          count: vectors.length,
          total_processed: extractedMemories.length,
        }),
      }, { onConflict: 'user_id,key' });

    return Response.json({
      success: true,
      extracted: vectors.length,
      total_processed: extractedMemories.length,
    });
  } catch (error) {
    console.error('[Memory Extract] Error:', error);
    return Response.json({ error: 'Extraction failed' }, { status: 500 });
  }
}

async function extractAtomicFacts(messages: ConversationMessage[]): Promise<ExtractedMemory[]> {
  const anthropic = new Anthropic();

  const conversationText = messages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  const prompt = `Extract atomic, memorable facts from this fitness coaching conversation. Each fact should be:
1. Self-contained (makes sense without context)
2. Specific (exact numbers, names, dates, details when available)
3. Durable (likely to be relevant in future coaching sessions)
4. Non-obvious (not basic profile info like height/weight that's stored elsewhere)

Categories to use: ${MEMORY_CATEGORIES.join(', ')}

Return a JSON array of objects with this structure:
[{
  "fact": "User hit a 225lb bench press PR on March 10th",
  "category": "training",
  "importance": 4,
  "source_text": "I just hit 225 on bench! That's a 10lb PR"
}]

Importance scale (1-5):
1 = Nice to know, low recall value
2 = Useful context
3 = Important preference or pattern
4 = Key milestone or strong preference
5 = Critical health/safety info (injuries, allergies, medical conditions)

Examples of good facts to extract:
- "User's right shoulder has been bothering them since a 2022 injury - avoid behind-the-neck presses"
- "User prefers training in the morning before 8am"
- "User hit 315lb deadlift PR after running 5/3/1 for 3 months"
- "User's girlfriend is vegetarian so dinners are often meatless"
- "User tends to undereat on rest days"
- "User found that 4-day Upper/Lower split works better than PPL for recovery"

CONVERSATION:
${conversationText}

Return ONLY a valid JSON array. No other text, markdown, or explanation.`;

  try {
    const response = await anthropic.messages.create({
      model: PINECONE_CONFIG.EXTRACTION_MODEL,
      max_tokens: PINECONE_CONFIG.EXTRACTION_MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || !('text' in textBlock)) {
      console.error('[Memory Extract] No text in response');
      return [];
    }

    // Try to parse JSON, handling potential markdown code blocks
    let jsonText = textBlock.text.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }

    const parsed = JSON.parse(jsonText);

    // Validate and filter results
    if (!Array.isArray(parsed)) {
      console.error('[Memory Extract] Response is not an array');
      return [];
    }

    return parsed.filter((item): item is ExtractedMemory => {
      return (
        typeof item.fact === 'string' &&
        item.fact.length > 0 &&
        MEMORY_CATEGORIES.includes(item.category) &&
        typeof item.importance === 'number' &&
        item.importance >= 1 &&
        item.importance <= 5 &&
        typeof item.source_text === 'string'
      );
    });
  } catch (error) {
    console.error('[Memory Extract] Failed to parse extraction response:', error);
    return [];
  }
}

async function deduplicateMemories(
  userId: string,
  memories: ExtractedMemory[]
): Promise<ExtractedMemory[]> {
  const pc = getPineconeClient();
  const index = getMemoryIndex();
  const newMemories: ExtractedMemory[] = [];

  for (const memory of memories) {
    try {
      // Generate embedding for the fact
      const embeddingResponse = await pc.inference.embed(
        'llama-text-embed-v2',
        [memory.fact],
        { inputType: 'query' }
      );

      const queryEmbedding = embeddingResponse.data[0]?.values;
      if (!queryEmbedding) {
        // Can't check for duplicates, include it anyway
        newMemories.push(memory);
        continue;
      }

      // Query for similar existing memories
      const results = await index.query({
        vector: queryEmbedding,
        topK: 1,
        filter: { user_id: { $eq: userId } },
        includeMetadata: true,
      });

      // If no highly similar memory exists, keep this one
      const topMatch = results.matches?.[0];
      if (!topMatch || (topMatch.score ?? 0) < PINECONE_CONFIG.DEDUP_SIMILARITY_THRESHOLD) {
        newMemories.push(memory);
      } else {
        console.log('[Memory Extract] Skipping duplicate:', memory.fact.substring(0, 50), '- similar to:', (topMatch.metadata?.fact as string)?.substring(0, 50));
      }
    } catch (error) {
      console.error('[Memory Extract] Dedup query failed for:', memory.fact.substring(0, 30), error);
      // Include the memory if we can't check for duplicates
      newMemories.push(memory);
    }
  }

  return newMemories;
}
