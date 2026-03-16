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
  console.log('[Memory Test] ========================================');
  console.log('[Memory Test] TEST MODE - Bypassing all session tracking');
  console.log('[Memory Test] ========================================');

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Memory Test] Authenticated user:', user.id);

  // Always use dummy messages by default - this is a TEST endpoint
  // No session tracking, no localStorage checks, no minimum message requirements
  let messages = DUMMY_MESSAGES;
  let usingCustomMessages = false;

  try {
    const body = await req.json();
    if (body.messages && Array.isArray(body.messages) && body.messages.length > 0) {
      messages = body.messages;
      usingCustomMessages = true;
    }
  } catch {
    // No body provided - use default dummy messages (expected behavior)
  }

  console.log('[Memory Test] Using', usingCustomMessages ? 'CUSTOM' : 'DUMMY', 'messages:', messages.length, 'total');

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
    console.log('[Memory Test] Extracting facts from', messages.length, 'messages');
    const extractedMemories = await extractAtomicFacts(messages);

    // Validate extractedMemories
    if (!extractedMemories || !Array.isArray(extractedMemories)) {
      console.error('[Memory Test] extractAtomicFacts returned invalid result:', typeof extractedMemories);
      return Response.json({
        success: false,
        error: 'Fact extraction returned invalid result',
        debug: { type: typeof extractedMemories, value: String(extractedMemories).substring(0, 100) }
      }, { status: 500 });
    }

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
    console.log('[Memory Test] Facts to embed:', factsToEmbed);

    // Check if inference API is available
    if (!pc.inference || typeof pc.inference.embed !== 'function') {
      console.error('[Memory Test] Pinecone inference API not available');
      return Response.json({
        success: false,
        error: 'Pinecone inference API not available',
        debug: { hasInference: !!pc.inference, embedType: typeof pc.inference?.embed }
      }, { status: 500 });
    }

    console.log('[Memory Test] Calling pc.inference.embed...');
    const embeddingResponse = await pc.inference.embed({
      model: 'llama-text-embed-v2',
      inputs: factsToEmbed,
      parameters: { inputType: 'passage' }
    });
    console.log('[Memory Test] Embedding response received:', JSON.stringify(embeddingResponse).substring(0, 300));

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

    if (vectors.length === 0) {
      console.log('[Memory Test] No valid vectors created (embeddings may have failed)');
      return Response.json({
        success: false,
        error: 'No valid vectors created',
        extracted_count: extractedMemories.length,
        message: 'Facts were extracted but embedding generation failed for all of them'
      }, { status: 500 });
    }

    console.log('[Memory Test] Upserting', vectors.length, 'vectors to Pinecone');
    await index.upsert({ records: vectors });

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
    const errorDetails = error instanceof Error
      ? { message: error.message, stack: error.stack?.split('\n').slice(0, 5).join('\n') }
      : { raw: String(error) };
    return Response.json({
      error: 'Extraction failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      debug: errorDetails
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

  console.log('[Memory Test] ===== FULL PROMPT TO HAIKU =====');
  console.log(prompt);
  console.log('[Memory Test] ===== END PROMPT =====');
  console.log('[Memory Test] Calling Haiku model:', PINECONE_CONFIG.EXTRACTION_MODEL);
  const response = await anthropic.messages.create({
    model: PINECONE_CONFIG.EXTRACTION_MODEL,
    max_tokens: PINECONE_CONFIG.EXTRACTION_MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  });

  console.log('[Memory Test] Haiku response received, content blocks:', response.content.length);

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock || !('text' in textBlock)) {
    console.error('[Memory Test] No text block in Haiku response');
    return [];
  }

  console.log('[Memory Test] ===== RAW HAIKU RESPONSE =====');
  console.log(textBlock.text);
  console.log('[Memory Test] ===== END HAIKU RESPONSE =====');

  try {
    let jsonText = textBlock.text.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }

    const parsed = JSON.parse(jsonText);
    console.log('[Memory Test] Parsed JSON, item count:', Array.isArray(parsed) ? parsed.length : 'not an array');

    if (!Array.isArray(parsed)) {
      console.error('[Memory Test] Parsed result is not an array:', typeof parsed);
      return [];
    }

    const filtered = parsed.filter((item): item is ExtractedMemory => {
      const checks = {
        hasFact: typeof item.fact === 'string',
        factNotEmpty: item.fact?.length > 0,
        validCategory: MEMORY_CATEGORIES.includes(item.category),
        hasImportance: typeof item.importance === 'number',
        importanceInRange: item.importance >= 1 && item.importance <= 5,
        hasSourceText: typeof item.source_text === 'string',
      };
      const isValid = Object.values(checks).every(Boolean);
      if (!isValid) {
        console.log('[Memory Test] Item failed validation:', checks);
        console.log('[Memory Test] Item data:', JSON.stringify(item).substring(0, 200));
        console.log('[Memory Test] Valid categories are:', MEMORY_CATEGORIES);
      }
      return isValid;
    });

    console.log('[Memory Test] After validation filter:', filtered.length, 'valid facts');
    return filtered;
  } catch (parseError) {
    console.error('[Memory Test] JSON parse error:', parseError);
    console.error('[Memory Test] Failed to parse text:', textBlock.text.substring(0, 200));
    return [];
  }
}
