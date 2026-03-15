import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { getMemoryIndex, isPineconeAvailable, getPineconeClient } from '@/lib/pinecone';
import { PINECONE_CONFIG, MEMORY_CATEGORIES, MemoryCategory } from '@/lib/constants';

/**
 * Test endpoint to manually trigger memory extraction with dummy messages.
 * Use this to verify Pinecone is receiving vectors.
 *
 * POST /api/memory/test-extract
 * Optional body: { messages: [...] } to use custom messages
 */

interface ExtractedMemory {
  fact: string;
  category: MemoryCategory;
  importance: number;
  source_text: string;
}

const DUMMY_MESSAGES = [
  { role: 'user', content: "Hey coach, I've been having some shoulder pain lately when I bench press. I think it's from an old rotator cuff injury back in 2022." },
  { role: 'assistant', content: "That's important to know. Rotator cuff issues can flare up with heavy pressing. Let's avoid behind-the-neck presses and wide-grip bench for now. How's your shoulder mobility work?" },
  { role: 'user', content: "I've been skipping it honestly. I also hit a new PR on deadlift last week - 315 for 3 reps! I've been running 5/3/1 for about 3 months now." },
  { role: 'assistant', content: "315x3 is solid progress on 5/3/1! That program clearly works for you. But we need to prioritize that shoulder mobility - 5 minutes before every push day. No exceptions." },
  { role: 'user', content: "Got it. Also, my girlfriend is vegetarian so our dinners are usually meatless. I try to hit my protein with eggs and greek yogurt during the day." },
  { role: 'assistant', content: "Smart adaptation. Eggs and greek yogurt are your protein anchors then. On training days, aim for 40g protein breakfast, 40g lunch, then whatever you can get at dinner. Consider a shake post-workout to bridge the gap." },
];

export async function POST(req: Request) {
  console.log('[Memory Test] Test extraction endpoint called');

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Allow custom messages or use dummy ones
  let messages = DUMMY_MESSAGES;
  try {
    const body = await req.json();
    if (body.messages && Array.isArray(body.messages) && body.messages.length > 0) {
      messages = body.messages;
    }
  } catch {
    // Use default dummy messages
  }

  console.log('[Memory Test] Using', messages.length, 'messages for extraction');

  // Check Pinecone availability
  const pineconeAvailable = await isPineconeAvailable();
  if (!pineconeAvailable) {
    return Response.json({
      success: false,
      error: 'Pinecone unavailable',
      hint: 'Check PINECONE_API_KEY and PINECONE_INDEX_NAME env vars'
    }, { status: 503 });
  }

  try {
    // Extract facts using Haiku
    console.log('[Memory Test] Extracting facts...');
    const extractedMemories = await extractAtomicFacts(messages);
    console.log('[Memory Test] Extracted', extractedMemories.length, 'facts');

    if (extractedMemories.length === 0) {
      return Response.json({
        success: true,
        extracted: 0,
        message: 'No facts extracted from messages'
      });
    }

    // Generate embeddings and upsert to Pinecone
    const pc = getPineconeClient();
    const index = getMemoryIndex();
    const now = new Date().toISOString();

    const factsToEmbed = extractedMemories.map(m => m.fact);
    console.log('[Memory Test] Generating embeddings for', factsToEmbed.length, 'facts');

    const embeddingResponse = await pc.inference.embed(
      'llama-text-embed-v2',
      factsToEmbed,
      { inputType: 'passage' }
    );

    // Validate embedding response
    if (!embeddingResponse?.data || !Array.isArray(embeddingResponse.data)) {
      console.error('[Memory Test] Invalid embedding response:', JSON.stringify(embeddingResponse).substring(0, 200));
      return Response.json({
        success: false,
        error: 'Failed to generate embeddings',
        debug: { responseKeys: Object.keys(embeddingResponse || {}) }
      }, { status: 500 });
    }

    console.log('[Memory Test] Got', embeddingResponse.data.length, 'embeddings');

    const vectors = extractedMemories.map((memory, i) => {
      const vectorId = `test-${user.id}-${Date.now()}-${i}`;
      const embeddingData = embeddingResponse.data[i];
      const embedding = embeddingData?.values;

      if (!embedding || !Array.isArray(embedding)) {
        console.error('[Memory Test] Missing or invalid embedding for index', i, '- got:', typeof embeddingData);
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
          test_extraction: true, // Mark as test data
        },
      };
    }).filter((v): v is NonNullable<typeof v> => v !== null);

    if (vectors.length > 0) {
      console.log('[Memory Test] Upserting', vectors.length, 'vectors to Pinecone');
      await index.upsert(vectors);
    }

    // Return detailed results for verification
    return Response.json({
      success: true,
      extracted: vectors.length,
      facts: extractedMemories.map(m => ({
        fact: m.fact,
        category: m.category,
        importance: m.importance,
      })),
      vector_ids: vectors.map(v => v.id),
      message: `Successfully extracted ${vectors.length} facts and stored in Pinecone`,
    });
  } catch (error) {
    console.error('[Memory Test] Error:', error);
    return Response.json({
      error: 'Extraction failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

async function extractAtomicFacts(messages: Array<{role: string; content: string}>): Promise<ExtractedMemory[]> {
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

CONVERSATION:
${conversationText}

Return ONLY a valid JSON array. No other text, markdown, or explanation.`;

  const response = await anthropic.messages.create({
    model: PINECONE_CONFIG.EXTRACTION_MODEL,
    max_tokens: PINECONE_CONFIG.EXTRACTION_MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock || !('text' in textBlock)) {
    return [];
  }

  try {
    let jsonText = textBlock.text.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }

    const parsed = JSON.parse(jsonText);

    if (!Array.isArray(parsed)) {
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
  } catch {
    return [];
  }
}
