# CLAUDE.md — NetGains AI

## Project Overview

NetGains AI is a vertical AI fitness coaching app. It provides personalized workout tracking, nutrition logging, and an AI coach that knows the user's training history, goals, and preferences. The coach is the core product.

**Target user:** Intermediate lifters (18-30) who want data-driven coaching without paying for a human trainer.

## Tech Stack

- **Frontend:** Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- **Backend:** Next.js API routes (serverless on Vercel)
- **Database:** Supabase (PostgreSQL + Auth + RLS)
- **AI:** Anthropic Claude API (Sonnet for coaching, Haiku for triggers/categorization)
- **Hosting:** Vercel
- **PWA:** Progressive Web App (installable on mobile)

## Project Structure

```
src/
├── app/
│   ├── (app)/           # Authenticated app pages (coach, log, nutrition, stats, program, debug)
│   ├── api/
│   │   ├── chat/              # Coach chat API (Sonnet) - tool_use for actions
│   │   ├── coach-trigger/     # Auto-triggers after meal/workout (Haiku)
│   │   ├── workout/pending/   # Pending workout from coach generator
│   │   ├── exercise/          # categorize, parse-split, recategorize-all
│   │   └── nutrition/         # estimate, recalculate
│   ├── login/ & signup/
├── components/
│   ├── workout-session.tsx    # Main workout logging UI
│   ├── exercise-picker-modal.tsx
│   ├── pending-workout-banner.tsx
│   └── ...
├── lib/
│   ├── supabase/        # DB client + types
│   ├── pr-detection.ts
│   └── date-utils.ts
└── constants.ts         # AI models, limits, defaults
```

## Database Tables

- **profiles** — user info (height, weight, goal, coaching_intensity, muscle_group_mode)
- **workouts** — workout sessions (date, notes)
- **sets** — individual sets (weight, reps, variant, measure_type)
- **nutrition_logs** — meals (name, calories, protein, carbs, fat, date)
- **coach_memory** — persistent state (split_rotation, food_staples, pending_workout, pending_changes)
- **chat_messages** — persisted chat for cross-device sync
- **exercise_templates** — user's exercises (name, muscle_group[], default_measure_type)

## Architecture Decisions

### AI Architecture
- **Sonnet for coaching**, Haiku for fast tasks (triggers, categorization, summarization)
- **tool_use for actions** — Coach uses tools like `updateUserProfile`, `saveMemory`, `logMeal`, `generateWorkout`
- **Conversation memory:** After 10 messages, summarize to bullet points in coach_memory
- **Token limit:** 2048 for coach responses
- **15 message daily limit** per user

### Models (check `constants.ts`)
- `claude-sonnet-4-20250514` — Coaching
- `claude-3-haiku-20240307` — Haiku tasks
- If 404 errors, check https://docs.anthropic.com/en/docs/resources/model-deprecations

### Coach Behavior
Evidence-based coaching with no broscience. System prompt in `getSystemPrompt()` in `src/app/api/chat/route.ts`.

Key behaviors:
- **Elite trainer voice** — Punchy headlines, biological mechanisms not labels, exact numbers
- **Phase awareness** — Tracks weeks on goal, water weight expectations, stall warnings
- **Goal-aware calories** — Cutting: ceiling (never suggest eating more). Bulking: floor.
- **Proactive momentum** — Every response ends with "next up: [action]"
- **Split rotation awareness** — Knows today's scheduled workout from `split_rotation`
- **Formatting** — Short paragraphs, blank line before any bold section header, no bullets

### Auto-Triggers
After meal/workout save, `/api/coach-trigger` (Haiku) generates directive, saves to `chat_messages`, badge appears on Coach tab.

### Exercise Categorization
14 muscle groups: chest, front_delt, side_delt, rear_delt, lats, upper_back, biceps, triceps, quads, hamstrings, glutes, calves, core, other. AI categorizes via `/api/exercise/categorize`. Exercises can belong to multiple groups.

### Set Variants
`normal`, `warmup`, `drop`, `failure`, `assisted-parent/child`, `left/right`. Warmup excluded from PRs.

### Timezone
Client sends `localDate` with every message. Never rely on server time.

## Profile Fields
- `goal` — cutting, bulking, maintaining
- `coaching_intensity` — light (~300 cal), moderate (~500), aggressive (~750+)
- `height_inches`, `weight_lbs`
- `muscle_group_mode` — simple (6 groups) or advanced (17 groups)

## Coach Memory Keys
- `name`, `age`, `training_split`, `split_rotation`, `injuries`
- `food_staples` — JSON array of foods user keeps stocked
- `pending_workout` — Generated workout waiting to load
- `pending_changes` — Settings changes to acknowledge
- `conversation_summary`, `coach_last_viewed_at`

## Onboarding

No separate flow. New users chat directly with coach.
1. Empty profile (no height/weight/goal) → coach asks for intro
2. Coach uses `updateUserProfile` and `saveMemory` tools to save data
3. After profile complete + `app_tour_shown` false → one-time app tour
4. Profile "empty" if missing: `height_inches`, `weight_lbs`, or `goal`

## Waitlist / Beta Access

- Non-logged-in → `/waitlist` page
- Logged-in + email in `allowed_testers` → full access
- Logged-in + not in `allowed_testers` → waitlist pending page
- Add testers directly to `allowed_testers` table in Supabase

## Current State (Mar 10)

### What's Working
- Workout logging with set variants and time-based sets
- Nutrition logging with calorie ring
- AI coach chat with persistent memory
- Coach Workout Generator — ask for a workout, loads into Log pre-populated
- Dynamic Daily Brief
- PR detection (excludes warmup)
- 15 message daily limit
- Exercise categorization with split-based tabs

### Recent Updates (Mar 10)
- **Coach Workout Generator** — "give me a 45 min chest workout" → Coach generates, suggests folder, loads into Log. Tools: `generateWorkout`, `getSuggestedFolder`, `loadWorkoutToFolder`. Endpoint: `/api/workout/pending`. Component: `PendingWorkoutBanner`.
- **Time-based sets** — Bodyweight exercises can use seconds (plank, dead hang). `measure_type` column on sets.
- **Multi-select muscle groups** — Exercises belong to multiple groups. `muscle_group` is TEXT[].
- **Simple/Advanced mode** — Toggle between 6 or 17 muscle groups.

## Coding Conventions

- TypeScript strictly — no `any` unless unavoidable
- Error handling on every Supabase query and API call
- Use `constants.ts` for models, limits — never hardcode
- Use `formatLocalDate()` from `date-utils.ts` for dates
- Coach system prompt in `getSystemPrompt()` in `src/app/api/chat/route.ts`

## Commands

```bash
npm run dev          # Local development
npm run build        # Production build
npm run lint         # Lint check
```

## Environment Variables

- `ANTHROPIC_API_KEY` — Claude API key
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key (client-side, RLS)
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (server-side, bypasses RLS) — Vercel only
