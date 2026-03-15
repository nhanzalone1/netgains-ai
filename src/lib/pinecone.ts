import { Pinecone } from '@pinecone-database/pinecone';
import { PINECONE_CONFIG } from './constants';

// Singleton pattern for serverless - reuse client across invocations
let pineconeClient: Pinecone | null = null;

export function getPineconeClient(): Pinecone {
  if (!pineconeClient) {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      throw new Error('PINECONE_API_KEY environment variable is not set');
    }
    pineconeClient = new Pinecone({ apiKey });
  }
  return pineconeClient;
}

export function getMemoryIndex() {
  const indexName = process.env.PINECONE_INDEX_NAME || PINECONE_CONFIG.INDEX_NAME;
  return getPineconeClient().index(indexName);
}

// Health check for graceful degradation
export async function isPineconeAvailable(): Promise<boolean> {
  try {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      console.warn('[Pinecone] API key not configured');
      return false;
    }

    const index = getMemoryIndex();
    await index.describeIndexStats();
    return true;
  } catch (error) {
    console.error('[Pinecone] Health check failed:', error);
    return false;
  }
}

// Memory metadata type
export interface MemoryMetadata {
  user_id: string;
  category: string;
  importance: number;
  fact: string;
  source_text: string;
  extracted_at: string;
  last_accessed: string;
}

// Retrieved memory type
export interface RetrievedMemory {
  id: string;
  fact: string;
  category: string;
  importance: number;
  score: number;
  extracted_at: string;
}
