# CLAUDE.md — NetGains AI

## Project Overview

NetGains AI is a vertical AI fitness coaching app. It provides personalized workout tracking, nutrition logging, and an AI coach that knows the user's training history, goals, and preferences. The coach is the core product — it's what makes this different from a generic fitness tracker.

**Target user:** Intermediate lifters (18-30) who want data-driven coaching without paying for a human trainer.

**Core value prop:** The AI coach remembers everything — your PRs, your sticking points, your split, your macros. It gets smarter the more you use it.

## Tech Stack

- **Frontend:** Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- **Backend:** Next.js API routes (serverless on Vercel)
- **Database:** Supabase (PostgreSQL + Auth + RLS)
- **AI:** Anthropic Claude API (Sonnet for everything — coach chat, onboarding parsing, daily brief)
- **Hosting:** Vercel
- **PWA:** Progressive Web App (installable on mobile)

## Project Structure

```
src/
├── app/
│   ├── (app)/           # Authenticated app pages
│   │   ├── coach/       # AI coach chat interface
│   │   ├── log/         # Workout logging
│   │   ├── nutrition/   # Meal tracking + calorie ring
│   │   ├── stats/       # Exercise history + PRs
│   │   ├── program/     # Training program
│   │   └── debug/       # Debug panel (dev only)
│   ├── api/
│   │   ├── chat/              # Coach chat API (Sonnet)
│   │   ├── daily-brief/       # Daily training card (Haiku)
│   │   ├── coach-onboarding/  # Structured onboarding save
│   │   ├── coach-reset/       # Reset coach state (supports ?full=true)
│   │   ├── nutrition-onboarding/ # Macro calculation + save
│   │   └── ...
│   ├── login/
│   └── signup/
├── components/
│   ├── coach-onboarding.tsx     # Structured 7-step onboarding UI
│   ├── nutrition-onboarding.tsx # Macro setup flow
│   ├── daily-brief-card.tsx     # Dynamic pre/post workout card
│   └── ...                      # Other shared UI components
├── lib/
│   ├── supabase/        # DB client + types
│   ├── pr-detection.ts  # Shared PR detection utility
│   ├── daily-brief-cache.ts # Client-side cache for Daily Brief
│   └── date-utils.ts    # Timezone-aware date helpers
└── constants.ts         # AI models, limits, defaults
```

## Database Tables

- **profiles** — user info (height, weight, goal, training mode, coaching mode)
- **workouts** — workout sessions (date, notes, muscle group)
- **sets** — individual sets (exercise, weight, reps, variant: normal/warmup/drop/failure)
- **nutrition_logs** — logged meals (name, calories, protein, carbs, fat, date)
- **coach_memory** — persistent coach state (split_rotation, conversation_summary, onboarding data, food_staples)
- **chat_messages** — persisted chat messages for cross-device sync
- **exercise_library** — master list of exercises with muscle groups

## Architecture Decisions

### AI Architecture
- **All Sonnet, no Haiku** — Simplicity over micro-optimization. Onboarding is 7 messages per user, not worth the complexity of model routing.
- **tool_use for structured extraction** — Onboarding uses Sonnet with tool_use to extract structured data (name, age, height, weight, goal, etc.) from open-ended user responses. Guarantees correct types.
- **Dynamic system prompt:** ~800 tokens for onboarded users, ~1,500 for new users
- **Compact data formats:** Workouts sent as "Bench: 185x5, 185x5[drop]" not full JSON
- **Conversation memory:** After 10 messages, summarize chat into bullet points stored in coach_memory. New messages get summary + last 10 messages.
- **Response length:** Coach defaults to 2-3 sentences. Longer responses only for how/why questions, plans, or meal breakdowns.
- **15 message daily limit** per user

### Timezone Handling
- Client sends `localDate` with every message
- Server uses client date for all meal/workout queries
- Never rely on server time (Vercel runs in UTC)

### Set Variants
- Sets have a `variant` field: normal (default), warmup, drop, failure
- Warm-up sets are excluded from PR detection
- Drop sets are tagged so coach knows weight decrease was intentional
- Visual indicators: yellow left border for warmup, orange for failure

### Chat Persistence
- Messages stored in `chat_messages` table (not localStorage)
- Cross-device sync (Mac ↔ iPhone)
- Messages load from DB on component mount

### Coach Memory Keys
Special keys in `coach_memory` table:
- `name` — User's preferred name
- `age` — User's age (string)
- `training_split` — Human-readable split name (e.g., "PPL", "Upper/Lower")
- `split_rotation` — JSON array of workout days (e.g., `["Push", "Pull", "Legs", "Rest"]`)
- `injuries` — User's injuries/limitations (or "none")
- `food_staples` — JSON array of foods user always has on hand (e.g., `["whey protein", "eggs", "rice"]`)
- `conversation_summary` — Haiku-generated summary of older messages
- `summary_message_count` — Number of messages included in the summary

RLS policies: users can only access their own data

## Coding Conventions

- Use TypeScript strictly — no `any` types unless unavoidable
- Error handling on every Supabase query and API call
- Use `constants.ts` for AI models, token limits, rate limits — never hardcode
- Cleanup timeouts and listeners in useEffect return functions
- Use `formatLocalDate()` from `date-utils.ts` for all date operations
- Coach system prompt lives in `getSystemPrompt()` in `src/app/api/chat/route.ts`

## Current State (Feb 21, 3AM)

### What's Working
- **Coach onboarding rebuilt as chat-style flow** with 7 fixed questions
- **Sonnet tool_use parsing** for extracting structured data from open-ended responses
- **Chat bubble UI** with input pinned at bottom — feels like a conversation
- **Nuclear reset SQL** saved in Supabase
- **Error handling improved** in chat route
- **Food staples memory** spec in `specs/food-staples-memory.md`
- **Workout logging** with set variants (warmup, drop, failure)
- **Nutrition logging** with calorie ring and macro tracking
- **AI coach** with persistent memory and cross-device sync
- **Dynamic Daily Brief** — Pre-workout/post-workout/rest day modes
- **PR detection** — Shared utility, excludes warmup sets
- **15 message daily limit** per user

### Bugs to Fix Tomorrow (Priority Order)
1. **ALL onboarding steps need max retry of 1** — if parsing fails, accept default and move on. User should NEVER see the same question twice
2. **coaching_mode step loops infinitely** — most broken step
3. **Final save fails with 500 "Failed to update profile"** — need to log exact Supabase error

### Tomorrow's Plan
1. Fix the retry/default logic on all parsing steps
2. Fix the profile save 500 error
3. Rewrite all 7 onboarding questions to sound like a real coach talking, not a survey
4. After the 7 questions + closing message with beta feedback line, Sonnet gets full freedom as an AI fitness/nutrition/health coach
5. The onboarding is the structured part. After that, the coach is a capable vertical AI that learns about its client over time
6. **ALL AI uses Sonnet** — no Haiku anywhere
7. Test full flow, then prep for dad & uncle beta

### Architecture Notes

**Onboarding flow:**
1. User opens Coach tab → `CoachOnboarding` component shown (not AI chat)
2. User answers 7 questions via chat-style UI
3. Sonnet tool_use extracts structured data from open-ended responses
4. `/api/coach-onboarding` saves to profile + coach_memory
5. `onboarding_complete` set to true → switches to regular Sonnet chat
6. User taps Nutrition → sees nutrition onboarding (macro setup)

**Daily Brief modes:**
- `pre_workout` — Shows focus ("Legs") + beat-this target + nutrition progress
- `post_workout` — Shows "Legs Complete" + achievement + PR badges (if any) + motivational line
- `rest_day` — Shows rest day messaging

### Known Issues
- Superset support not yet implemented (requires linking exercises)
- Onboarding parsing bugs (see above)

### Beta Status
- Fixing onboarding bugs first
- Then testing with dad & uncle
- Then 3-4 friends test for 3-5 days
- Collecting feedback to guide Phase 2

## Phase 2 Roadmap (post-beta)

### 1. Claude Agent SDK Migration
Replace hand-built API route with the Agent SDK. Get built-in agent loop, tool execution, session management, and cost tracking. Less code to maintain, fewer bugs.

### 2. Subagent Architecture
Split the coach into specialists:
- **Main Coach** (Sonnet) — conversation, personality, user-facing responses
- **Nutrition Analyzer** (Haiku) — macro calculations, meal suggestions
- **Workout Analyzer** (Haiku) — volume analysis, plateau detection, progressive overload
- **Memory Summarizer** (Haiku) — already implemented, formalize as subagent
- **Daily Brief Generator** (Haiku) — daily training card and beat-this targets

### 3. Structured Output
Return JSON with explicit actions instead of parsing freeform text:
```json
{
  "response_text": "solid leg day...",
  "actions": [{ "type": "log_meal", "date": "2026-02-20", "meals": [...] }]
}
```

### 4. Hooks (Centralized Safety & Control)
- Pre-response: check daily message limit
- Pre-meal-log: validate macros are reasonable
- Pre-advice: add disclaimer if topic is medical
- Post-response: log token count and cost

### 5. MCP Integrations
- Apple HealthKit / Google Fit (steps, heart rate, sleep)
- MyFitnessPal (food logging, barcode scanning)
- Wearables (Oura, Whoop, Apple Watch)

### 6. React Native / Expo Migration
Move from PWA to native app for App Store. Unlocks push notifications, HealthKit, offline logging, camera for food photos.

### 7. Cost Architecture at Scale
- Target: under $0.10 per user session
- Per-user cost tracking in database
- Cache Daily Brief (don't regenerate on every tab open)
- RAG-style caching for generic fitness questions

### 8. Pricing Model (TBD after beta)
- Free tier: workout logging + basic stats (no AI coach)
- Paid tier: AI coach, nutrition tracking, personalized plans

## Specs & Plans

When building new features, create a spec file in `specs/` before writing code:
```
specs/
├── food-staples-memory.md  # Food memory feature spec
├── superset-support.md     # Superset linking (not yet implemented)
└── ...
```

Format:
```markdown
# Feature: [Name]
## Problem
## Solution
## Files to Modify
## Testing
## Out of Scope
```

## Commands

```bash
npm run dev          # Local development
npm run build        # Production build
npm run lint         # Lint check
```

## Environment Variables

- `ANTHROPIC_API_KEY` — Claude API key
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key
