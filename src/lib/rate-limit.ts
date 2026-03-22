/**
 * Simple in-memory rate limiter for API endpoints
 *
 * Note: This implementation uses in-memory storage which works for single-server
 * deployments. For multi-server deployments (e.g., Vercel with multiple regions),
 * consider upgrading to @upstash/ratelimit with Redis/KV.
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory storage for rate limiting
// Key format: `${identifier}_${windowKey}`
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let cleanupScheduled = false;

function scheduleCleanup() {
  if (cleanupScheduled) return;
  cleanupScheduled = true;

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetTime) {
        rateLimitStore.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
}

interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

/**
 * Check rate limit for an identifier
 * @param identifier - Unique identifier (e.g., user ID or IP address)
 * @param config - Rate limit configuration
 * @returns Rate limit result with headers info
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  scheduleCleanup();

  const now = Date.now();
  const windowKey = Math.floor(now / (config.windowSeconds * 1000));
  const key = `${identifier}_${windowKey}`;

  const entry = rateLimitStore.get(key);
  const resetTime = (windowKey + 1) * config.windowSeconds * 1000;

  if (!entry || now > entry.resetTime) {
    // New window, start fresh
    rateLimitStore.set(key, { count: 1, resetTime });
    return {
      success: true,
      limit: config.limit,
      remaining: config.limit - 1,
      reset: resetTime,
    };
  }

  if (entry.count >= config.limit) {
    // Rate limit exceeded
    return {
      success: false,
      limit: config.limit,
      remaining: 0,
      reset: entry.resetTime,
    };
  }

  // Increment counter
  entry.count++;
  return {
    success: true,
    limit: config.limit,
    remaining: config.limit - entry.count,
    reset: entry.resetTime,
  };
}

/**
 * Create a 429 Too Many Requests response
 */
export function rateLimitResponse(result: RateLimitResult): Response {
  const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);

  return new Response(
    JSON.stringify({
      error: 'Too many requests',
      message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(result.reset),
      },
    }
  );
}

/**
 * Get client IP from request headers
 */
export function getClientIP(request: Request): string {
  // Check various headers that might contain the real IP
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs; take the first one
    return forwarded.split(',')[0].trim();
  }

  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  // Vercel-specific header
  const vercelIP = request.headers.get('x-vercel-forwarded-for');
  if (vercelIP) {
    return vercelIP.split(',')[0].trim();
  }

  // Fallback - shouldn't happen in production
  return 'unknown';
}

// Preset configurations for common use cases
export const RATE_LIMITS = {
  // Chat API: 20 per user per minute, 60 per IP per minute
  CHAT_USER: { limit: 20, windowSeconds: 60 },
  CHAT_IP: { limit: 60, windowSeconds: 60 },

  // AI endpoints: 10 per user per minute
  AI_ENDPOINT: { limit: 10, windowSeconds: 60 },

  // Waitlist: 5 per IP per minute
  WAITLIST: { limit: 5, windowSeconds: 60 },
} as const;
