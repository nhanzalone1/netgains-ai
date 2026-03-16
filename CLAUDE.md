# CLAUDE.md — NetGains AI

## Overview

Vertical AI fitness coaching app. Personalized workout tracking, nutrition logging, and an AI coach that knows training history, goals, and preferences. Coach is the core product.

**Target:** Intermediate lifters (18-30) who want data-driven coaching without a human trainer.

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React, TypeScript, Tailwind CSS
- **Backend:** Next.js API routes (serverless on Vercel)
- **Database:** Supabase (PostgreSQL + Auth + RLS)
- **Vector DB:** Pinecone (long-term memory, `llama-text-embed-v2`)
- **AI:** Claude Sonnet (coaching), Claude Haiku (triggers, extraction, categorization)
- **Email:** Resend (transactional)

## Project Structure

```
src/
├── app/
│   ├── (app)/              # Auth pages: coach, log, nutrition, stats, program
│   ├── api/
│   │   ├── chat/           # Coach API (Sonnet + tool_use)
│   │   ├── memory/         # extract, list, test-extract
│   │   ├── coach-trigger/  # Post-meal/workout triggers (Haiku)
│   │   ├── exercise/       # categorize, parse-split
│   │   ├── nutrition/      # estimate, recalculate
│   │   └── workout/        # pending workout from coach
├── components/
├── lib/
│   ├── supabase/           # DB client + types
│   ├── pinecone.ts         # Vector client (SDK v7)
│   ├── memory-retrieval.ts # Query memories
│   └── constants.ts        # Models, limits, config
```

## Database

- **profiles** — height, weight, goal, coaching_intensity, muscle_group_mode
- **workouts** / **exercises** / **sets** — workout logging with variants
- **nutrition_logs** — meals with macros
- **coach_memory** — key-value store (split_rotation, food_staples, pending_workout, etc.)
- **chat_messages** — persisted for cross-device sync
- **exercise_templates** — user's exercises with muscle_group[]
- **weigh_ins** — daily weight, auto-syncs to profiles.weight_lbs

## AI Architecture

### Models
Check `constants.ts` for current model IDs. If 404 errors, check [model deprecations](https://docs.anthropic.com/en/docs/resources/model-deprecations).

### Coach (Sonnet)
- System prompt: `getSystemPrompt()` in `api/chat/route.ts`
- Tools: `updateUserProfile`, `saveMemory`, `logMeal`, `generateWorkout`, `loadWorkoutToFolder`
- Evidence-based, no broscience. Punchy headlines, exact numbers, ends with "next up: [action]"
- Goal-aware: cutting = calorie ceiling, bulking = calorie floor
- Daily limit: 15 messages (disabled for testing via `constants.ts`)

### Long-Term Memory (Pinecone)
- **Extraction:** On tab visibility change, Haiku extracts atomic facts from conversation
- **Retrieval:** Top 7 memories injected into system prompt per message
- **Dedup:** 0.92 similarity threshold
- **Categories:** training, nutrition, injuries, preferences, biometrics, history
- **UI:** User Menu → "What Coach Remembers"
- **Config:** `PINECONE_CONFIG` in `constants.ts`

**SDK v7 syntax:**
```typescript
// Embeddings
pc.inference.embed({ model: 'llama-text-embed-v2', inputs: [...], parameters: { inputType: 'passage' } })
// Upsert
index.upsert({ records: vectors })
```

### Auto-Triggers
After meal/workout save, Haiku generates proactive message → badge on Coach tab.

## Key Patterns

### Client → Server Context
Every chat message includes `localDate` (YYYY-MM-DD) and `localTime` (e.g., "9:15 PM"). Never use server time.

### Profile & Goal Normalization
Goals accept variations: cut→cutting, bulk→bulking, maintain→maintaining. Auto-normalized via `normalizeGoal()`.

### Exercise Categorization
14 muscle groups. Exercises can belong to multiple. AI categorizes via `/api/exercise/categorize`.

### Set Variants
`normal`, `warmup`, `drop`, `failure`, `assisted-parent/child`, `left/right`. Warmup excluded from PRs.

### PR Detection
Separated by equipment type. Excludes warmup and time-based sets.

## Onboarding

1. Empty profile → Coach asks for intro
2. Coach uses tools to save profile data
3. After profile complete → interactive app tour (spotlight overlay)
4. Profile "empty" if missing: height_inches, weight_lbs, or goal

## Waitlist / Beta

- Non-logged-in → `/waitlist`
- Logged-in + in `allowed_testers` → full access
- Beta invite: `POST /api/admin/invite-beta` with `Authorization: Bearer $ADMIN_API_SECRET`

## Coding Conventions

- TypeScript strict — no `any` unless unavoidable
- Use `constants.ts` for models, limits — never hardcode
- Use `.maybeSingle()` not `.single()` for optional Supabase queries
- **Do NOT run `shadcn init`** — overwrites globals.css dark theme

## Commands

```bash
npm run dev      # Local dev
npm run build    # Production build
npm run lint     # Lint check
```

## Environment Variables

```
ANTHROPIC_API_KEY
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
PINECONE_API_KEY
PINECONE_INDEX_NAME=netgains-memory
RESEND_API_KEY
ADMIN_API_SECRET
```

**Vercel:** Use project `netgains-ai` (not `netgains-ai-8qeb`).
