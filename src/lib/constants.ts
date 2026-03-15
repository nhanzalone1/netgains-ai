// Centralized constants for the app
// Move hardcoded values here for easier configuration

// === AI MODEL CONFIGURATION ===
export const AI_MODELS = {
  COACHING: 'claude-sonnet-4-20250514',
  SUMMARIZATION: 'claude-3-haiku-20240307',
  DAILY_BRIEF: 'claude-3-haiku-20240307',
  NUTRITION_ESTIMATE: 'claude-3-haiku-20240307',
  ONBOARDING_PARSE: 'claude-3-haiku-20240307',
} as const;

export const AI_TOKEN_LIMITS = {
  COACHING: 2048,
  SUMMARIZATION: 250,
  DAILY_BRIEF: 150,
  NUTRITION_ESTIMATE: 256,
  ONBOARDING_PARSE: 256,
} as const;

// === RATE LIMITING ===
export const RATE_LIMITS = {
  // TODO: Set to 15 before public launch
  DAILY_MESSAGE_LIMIT: 9999, // Temporarily disabled (was 15)
  MAX_TOOL_ROUNDS: 10,
  SUMMARY_TRIGGER_INTERVAL: 10,
  RECENT_MESSAGES_TO_KEEP: 10,
} as const;

// === NUTRITION DEFAULTS ===
export const NUTRITION_DEFAULTS = {
  WEIGHT_LBS: 170,
  HEIGHT_INCHES: 70,
  AGE: 30,
  DAYS_PER_WEEK: 4,
  BULK_SURPLUS_CALORIES: 300,
  CUT_DEFICIT_CALORIES: 500,
  FAT_PERCENTAGE: 0.25,
} as const;

export const DEFAULT_NUTRITION_GOALS = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fat: 65,
} as const;

// === ACTIVITY FACTORS (Mifflin-St Jeor) ===
export const ACTIVITY_FACTORS = {
  SEDENTARY: 1.375,      // <= 2 days/week
  LIGHT: 1.55,           // 3-4 days/week
  MODERATE: 1.725,       // 5-6 days/week
  VERY_ACTIVE: 1.9,      // 7 days/week
} as const;

// === UNIT CONVERSIONS ===
export const CONVERSIONS = {
  LBS_TO_KG: 0.453592,
  INCHES_TO_CM: 2.54,
} as const;

// === PINECONE MEMORY CONFIGURATION ===
export const PINECONE_CONFIG = {
  INDEX_NAME: 'netgains-memory',
  RETRIEVAL_TOP_K: 7,
  SIMILARITY_THRESHOLD: 0.7,
  DEDUP_SIMILARITY_THRESHOLD: 0.92,
  EXTRACTION_MODEL: 'claude-3-haiku-20240307',
  EXTRACTION_MAX_TOKENS: 1024,
  SESSION_DEBOUNCE_MS: 5000,
} as const;

export const MEMORY_CATEGORIES = [
  'training',
  'nutrition',
  'injuries',
  'preferences',
  'biometrics',
  'history',
] as const;

export type MemoryCategory = typeof MEMORY_CATEGORIES[number];