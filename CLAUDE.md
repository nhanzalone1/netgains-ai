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
│   │   ├── chat/              # Coach chat API (Sonnet) - handles onboarding via tool_use
│   │   ├── daily-brief/       # Daily training card (Haiku)
│   │   ├── coach-reset/       # Reset coach state (supports ?full=true)
│   │   ├── nutrition-onboarding/ # Macro calculation + save
│   │   ├── nutrition/recalculate/ # Recalc goals when intensity changes
│   │   ├── exercise/
│   │   │   ├── categorize/        # AI categorizes exercise → muscle group
│   │   │   ├── parse-split/       # AI parses split day names → muscle groups
│   │   │   └── recategorize-all/  # Batch re-categorize all exercises
│   │   └── ...
│   ├── login/
│   └── signup/
├── components/
│   ├── nutrition-onboarding.tsx # Macro setup flow
│   ├── daily-brief-card.tsx     # Dynamic pre/post workout card
│   ├── splash-screen.tsx        # Animated splash on app load
│   └── ...                      # Other shared UI components
├── lib/
│   ├── supabase/        # DB client + types
│   ├── pr-detection.ts  # Shared PR detection utility
│   ├── daily-brief-cache.ts # Client-side cache for Daily Brief
│   └── date-utils.ts    # Timezone-aware date helpers
└── constants.ts         # AI models, limits, defaults
```

## Database Tables

- **profiles** — user info (height, weight, goal, training mode, coaching mode, coaching_intensity)
- **workouts** — workout sessions (date, notes, muscle group)
- **sets** — individual sets (exercise, weight, reps, variant: normal/warmup/drop/failure)
- **nutrition_logs** — logged meals (name, calories, protein, carbs, fat, date)
- **coach_memory** — persistent coach state (split_rotation, conversation_summary, onboarding data, food_staples)
- **chat_messages** — persisted chat messages for cross-device sync
- **exercise_library** — master list of exercises with muscle groups
- **exercise_templates** — user's custom exercises (name, muscle_group, user_id)

## Architecture Decisions

### AI Architecture
- **All Sonnet, no Haiku** — Simplicity over micro-optimization. Onboarding is 7 messages per user, not worth the complexity of model routing.
- **tool_use for structured extraction** — Onboarding uses Sonnet with tool_use to extract structured data (name, age, height, weight, goal, etc.) from open-ended user responses. Guarantees correct types.
- **Dynamic system prompt:** ~800 tokens for onboarded users, ~1,500 for new users
- **Compact data formats:** Workouts sent as "Bench: 185x5, 185x5[drop]" not full JSON
- **Conversation memory:** After 10 messages, summarize chat into bullet points stored in coach_memory. New messages get summary + last 10 messages.
- **Response length:** Coach matches the depth of the moment — weight check-ins get full narrative debriefs, meal logs get biology + optimization, quick questions get sharp answers. Token limit: 2048.
- **15 message daily limit** per user

### API Error Handling
- **529 Overloaded** — Anthropic's API occasionally returns 529 when under heavy load. This is temporary (usually resolves in minutes to an hour). The chat route retries twice with exponential backoff, then shows a friendly message: "coach is busy right now — try again in a minute."
- **No fallback to weaker models** — We don't fall back to Haiku when Sonnet is overloaded. Better to wait than give degraded responses.
- **Error logging** — All API errors are logged with stack traces for debugging. Check Vercel logs if issues persist.

### Model Deprecation (Feb 25, 2026)
- **claude-3-5-haiku-20241022** — Deprecated, returns 404. Was used for Daily Brief, Nutrition Estimate, and Onboarding Parse.
- **claude-3-haiku-20240307** — Still works. Now used for all Haiku tasks (summarization, daily brief, nutrition estimate, onboarding).
- **claude-sonnet-4-20250514** — Current model for coaching. May get 529 overloaded during high demand.
- **Check model status** — If features break with 404 errors, check https://docs.anthropic.com/en/docs/resources/model-deprecations for deprecated models and update `src/lib/constants.ts`.

### Science-Based Coaching System
The coach uses evidence-based exercise science and sports nutrition principles. No broscience. System prompt lives in `getSystemPrompt()` in `src/app/api/chat/route.ts`.

**Elite Trainer Voice (Feb 27):**
- Coach is an elite personal trainer, not a chatbot — locked in with the user every day
- Every response opens with a punchy headline that makes the user feel something: "The biological math never lies." / "You just robbed your fat stores in your sleep."
- Explains the WHY behind every observation with specific biology, not labels
- Uses exact numbers and body stats to make it personal: "you're running a 400-calorie deficit on a 174 lb frame"
- Names strategic moves like missions: "The Pump Primer", "The Fasted Strike"
- Ends with direct action command + follow-up question

**Labeling vs Mechanism (CRITICAL):**
- NEVER label food good/bad: "skip the casserole, it's a calorie bomb"
- ALWAYS explain mechanism: "the casserole is loaded with heavy cream — that fat payload will slow gastric emptying and trap protein in your gut for 3+ hours instead of delivering it to muscles while they're repairing. you just trained — you need fast absorption, not a fat-delayed protein trickle."
- The difference: labeling tells them what. Mechanism tells them what happens inside their body.

**Phase Awareness** — Tracks how long user has been on current goal:
- Cutting: Week 1-2 water weight expectations, week 3-4 stall warnings, diet break recommendations at week 6-8+
- Bulking: Week 1-2 glycogen/water gain expectations, flags if weight climbing too fast or lifts not progressing
- Maintaining: Tracks 2-3 lb stability range, flags consistent drift

**Pattern Recognition** — Analyzes 5-7 day trends, not single days:
- Catches weekend overeating patterns
- Acknowledges consistency streaks
- Single-day data is noise, trends are signal

**Goal-Aware Calorie Accountability:**
- Cutting: Calories are a CEILING. Never suggest eating more to "close the gap." Only flag if over calories or under protein.
- Bulking: Calories are a FLOOR. Flag if consistently under.
- Maintaining: Target is target, flag drift in either direction.

**Training-Nutrition Integration:**
- Uses `split_rotation` to know what today's training is
- Adjusts carb guidance for heavy compound days vs rest days
- Cutting: prioritize protein + adequate carbs around training
- Bulking: push carbs on training days for glycogen

**Progressive Overload Tracking:**
- Compares logged workouts to previous sessions
- Cutting: strength maintenance is the goal — flags 2-3 week drops
- Bulking: strength should increase — flags stalls after 3-4 weeks
- Suggests deload weeks every 4-6 weeks (40-50% volume reduction)

**Recovery Signals** — Checks before blaming diet:
- Sleep quality and duration
- Life stress levels
- Training volume / accumulated fatigue

**Protein Distribution:**
- 30-50g per meal across 3-5 meals for optimal MPS
- Flags if all protein concentrated in one meal

**Weekly Check-ins:**
- Prompts weigh-ins after 7+ days
- Tracks weekly averages, not daily fluctuations
- Recognizes recomposition (lifts up + leaner but weight stable)

**Context-Aware Responses:**
- Morning: focus on daily plan
- Post-workout: recovery nutrition + session review
- Evening: accountability check + prep for tomorrow

**Honesty Rule:**
- If evidence is mixed, say so: "research suggests X but it's not definitive"
- Don't present preferences as facts

**Proactive Momentum System (Mar 2):**
Coach is always one step ahead. Every interaction ends with a clear directive for what's next. The user should never have to ask "what do I eat now" or "what do I do next."

- **Morning weight check-in:** Automatically deliver the full day plan — headline reaction, first meal with exact gram targets, training window, post-workout meal, closing mandate
- **After logging a meal:** Acknowledge with biological context, tell them exactly when the next meal is and what to focus on, end with "next up: [X] at [time] — [why it matters]"
- **After logging a workout:** React to the session, tell them the post-workout window is open with exact protein/carb targets, explain why this meal matters biologically, preview the next meal
- **End of day:** Tell them if they're on track, if protein is short give exact instructions, close with "biological ledger for today: [summary]. sleep is the next phase."

General rule: Every response ends with what's next. Never leave the user at a dead end.

**Auto-Trigger System (Mar 2):**
When users log meals or complete workouts, the system automatically generates a coach "next up" directive without requiring them to open the coach tab.

How it works:
1. User confirms a meal or saves a workout
2. `/api/coach-trigger` endpoint is called (uses Haiku for speed/cost)
3. Haiku generates a short directive based on user context (goals, today's nutrition, food staples)
4. Message is saved to `chat_messages` table
5. Badge appears on Coach tab in bottom nav
6. When user opens coach tab, message is already there

Technical details:
- `src/app/api/coach-trigger/route.ts` — Haiku-powered endpoint (300 token limit)
- `src/lib/coach-notification.ts` — Database-backed notification state
- Badge state uses `coach_last_viewed_at` in `coach_memory` table (persists across sessions/devices)
- Triggers from: `handleSaveFood`, `markAsConsumed`, `copyMeal` (nutrition), `handleSaveWorkout` (log)
- Context includes: `localTime`, `localHour`, `localDate` for timezone-aware responses

**Exercise Categorization System (Mar 5):**
Exercises are categorized into 14 detailed muscle groups for split-aware filtering.

Muscle groups:
- **Upper push**: chest, front_delt, side_delt, triceps
- **Upper pull**: rear_delt, lats, upper_back, biceps
- **Lower**: quads, hamstrings, glutes, calves
- **Core**: core
- **Fallback**: other

How it works:
1. User creates new exercise in exercise picker
2. `/api/exercise/categorize` uses Haiku to determine muscle group
3. User can override with dropdown in create/edit modal
4. Category stored in `muscle_group` column on `exercise_templates`

Split-based tabs:
- Tabs are generated from user's `split_rotation` (Rest days excluded)
- `/api/exercise/parse-split` maps split day names to muscle groups:
  - "Chest/Front Delt" → ["chest", "front_delt"]
  - "Back/Rear Delt" → ["lats", "upper_back", "rear_delt"]
  - "Arms/Side Delt" → ["biceps", "triceps", "side_delt"]
- Exercises show under the tab if their muscle_group is in that tab's muscle array

Auto-migration:
- When picker opens, if any exercises have null muscle_group, calls `/api/exercise/recategorize-all`
- Batch categorizes all uncategorized exercises in parallel (10 at a time)
- Shows loading state during migration

Technical details:
- `src/components/exercise-picker-modal.tsx` — Main picker with tabs, search, create/edit modals
- `src/app/api/exercise/categorize/route.ts` — Single exercise categorization (Haiku)
- `src/app/api/exercise/parse-split/route.ts` — Split day → muscle group mapping (Haiku)
- `src/app/api/exercise/recategorize-all/route.ts` — Batch recategorize all user exercises
- Database: `exercise_templates.muscle_group` column with enum constraint

**Settings Change Acknowledgment (Mar 5):**
When users change settings (intensity, training split), the AI acknowledges changes in its next response without sending an extra message.

How it works:
1. User changes intensity or split in profile settings
2. Change saved to `pending_changes` array in coach_memory (e.g., `["intensity: moderate → aggressive"]`)
3. On next user message, chat API sees pending_changes and adds `[SETTINGS CHANGED]` context block
4. AI acknowledges changes naturally in response: "noted — switching to aggressive mode..."
5. After response, pending_changes is cleared from coach_memory

Benefits:
- No separate "settings changed" message cluttering the chat
- Acknowledgment feels natural as part of conversation
- User knows AI is aware of their changes

Technical details:
- Changes saved in `user-menu.tsx` when intensity or split is modified
- `src/app/api/chat/route.ts` reads pending_changes and includes in system context
- Cleared after AI response completes (in stream handler)

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
- **User messages**: Saved client-side immediately when sent
- **Assistant messages**: Saved server-side after streaming completes (ensures responses aren't lost if user navigates away)
- Badge polling: Bottom nav checks for new messages every 5 seconds when not on coach page

### Profile Fields
Key fields in `profiles` table:
- `goal` — "cutting", "bulking", or "maintaining"
- `coaching_intensity` — "light", "moderate", or "aggressive" (affects calorie deficit/surplus size)
- `coaching_mode` — "full" (coach builds program) or "assist" (user has own program)
- `height_inches` — User's height in total inches
- `weight_lbs` — User's weight in pounds

### Coach Memory Keys
Special keys in `coach_memory` table:
- `name` — User's preferred name
- `age` — User's age (string)
- `training_split` — Human-readable split name (e.g., "PPL", "Upper/Lower")
- `split_rotation` — JSON array of workout days (e.g., `["Push", "Pull", "Legs", "Rest"]`)
- `injuries` — User's injuries/limitations (or "none")
- `food_staples` — JSON array of foods user always has on hand (e.g., `["whey protein", "eggs", "rice"]`)
- `goal_start_date` — When user started current goal (for phase awareness)
- `conversation_summary` — Haiku-generated summary of older messages
- `summary_message_count` — Number of messages included in the summary
- `coach_last_viewed_at` — ISO timestamp of when user last opened coach tab (for unread badge)
- `pending_changes` — JSON array of settings changes to acknowledge in next response (e.g., `["intensity: moderate → aggressive"]`)

RLS policies: users can only access their own data

## Coding Conventions

- Use TypeScript strictly — no `any` types unless unavoidable
- Error handling on every Supabase query and API call
- Use `constants.ts` for AI models, token limits, rate limits — never hardcode
- Cleanup timeouts and listeners in useEffect return functions
- Use `formatLocalDate()` from `date-utils.ts` for all date operations
- Coach system prompt lives in `getSystemPrompt()` in `src/app/api/chat/route.ts`

## Onboarding (Simplified)

There is no separate onboarding flow. New users go directly to the coach chat.

### How it works
1. When a user has an empty profile (no height, weight, goal), the coach shows a hardcoded first message asking them to introduce themselves
2. User types whatever they want in the normal chat input
3. The chat API handles it with tool_use — coach uses `updateUserProfile` and `saveMemory` tools to save info
4. System prompt includes guidance to focus on collecting basics first before discussing nutrition/workouts
5. Once profile is complete (has height, weight, goal) AND `app_tour_shown` is false, coach gives a one-time tour of the app tabs
6. After showing tour, coach calls `updateUserProfile app_tour_shown:true` so it doesn't repeat

### Hardcoded first message (shown when profile is empty)
"hey, i'm your ai coach. i'll help you train smarter, eat right, and stay on track. tell me a bit about yourself — your age, height, weight, what you're training for, and what split you're running. throw in anything else you think i should know."

### Profile completeness check
Profile is considered "empty" if missing: `height_inches`, `weight_lbs`, or `goal`

### Service role client for profile updates
The `updateUserProfile` tool uses service role client to bypass RLS:
```typescript
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

## Waitlist / Beta Access System

Built waitlist/allowlist system for controlled beta access.

### How it works
1. Non-logged-in users see `/waitlist` page with email signup
2. Logged-in users are checked against `allowed_testers` table in Supabase
3. If email is in `allowed_testers` → full app access
4. If email is NOT in `allowed_testers` → redirect to "You're on the waitlist" page

### Database tables
- `waitlist_emails` — collected emails from waitlist signups (email, created_at)
- `allowed_testers` — approved tester emails (email, created_at, added_by)

### Flow
```
User visits site
  → Not logged in? Show /waitlist page (email collection)
  → Logged in + email in allowed_testers? Full app access
  → Logged in + email NOT in allowed_testers? Show "You're on the list" page
```

### Adding testers
Add approved emails directly to `allowed_testers` table in Supabase dashboard.

### Middleware
`middleware.ts` checks auth status and allowed_testers table, redirects accordingly.

## Current State (Mar 5)

### What's Working
- **Workout logging** with set variants (warmup, drop, failure)
- **Nutrition logging** with calorie ring and macro tracking
- **AI coach chat** with persistent memory and cross-device sync
- **Dynamic Daily Brief** — Pre-workout/post-workout/rest day modes
- **PR detection** — Shared utility, excludes warmup sets
- **15 message daily limit** per user
- **Nuclear reset** via `/debug` page
- **Splash screen** — Animated line chart + "NetGainsAI" on app load
- **Split folder reordering** — Move Up/Down buttons in edit modal
- **Default to Coach tab** — App always opens to /coach after login

### Recent Updates (Mar 7)
- **App tour after onboarding** — When a user completes onboarding (has height, weight, goal), the coach gives a one-time tour explaining each tab: Coach (chat/advice), Log (track workouts), Nutrition (daily calories/macros), Stats (PRs/progress). Tracked via `app_tour_shown` in profiles so it only shows once.
- **Onboarding profile save fix** — The system prompt was telling the AI to save height, weight, and goal to `coach_memory` via `saveMemory`, but the app reads these from the `profiles` table. Now instructs AI to use `updateUserProfile` for profile fields (height_inches, weight_lbs, goal) and `saveMemory` for memory fields (name, age, training_split, injuries). New users will now have their profile data saved correctly.
- **Quick edit button for exercises** — Added pencil icon to each exercise row in the library. Tap to open edit modal directly without entering edit mode. Change muscle group, name, or equipment instantly.

### Previous Updates (Mar 5)
- **Coach badge when navigating away** — When user sends a message and navigates to another tab (Log, Nutrition) while waiting for a response, the coach response is now saved server-side and badge appears on Coach tab. Server saves assistant messages to DB after streaming completes. Bottom nav polls every 5 seconds (when not on coach page) to check for new responses. Fixes lost responses when navigating away.
- **Exercise categorization overhaul** — Complete rewrite of exercise picker. Now uses detailed muscle groups (front_delt, side_delt, rear_delt instead of just "shoulders") with AI-powered categorization. Tabs match user's split rotation (Rest days excluded). Features:
  - **14 muscle groups**: chest, front_delt, side_delt, rear_delt, lats, upper_back, biceps, triceps, quads, hamstrings, glutes, calves, core, other
  - **AI categorization**: Haiku categorizes new exercises automatically (user can override via dropdown)
  - **Quick edit button**: Pencil icon on each exercise row opens edit modal directly (no need to enter edit mode). Change muscle group, name, or equipment instantly.
  - **Split-based tabs**: Tabs come from user's split_rotation (e.g., "Chest/Front Delt", "Back/Rear Delt")
  - **Auto-recategorize**: On picker open, if any exercises have null muscle_group, batch recategorizes all uncategorized exercises
  - **New endpoints**: `/api/exercise/categorize`, `/api/exercise/parse-split`, `/api/exercise/recategorize-all`
  - **Database migration**: Added `muscle_group` column to `exercise_templates` table
- **Pending changes acknowledgment** — When user changes intensity or split in settings, changes are saved to `pending_changes` in coach_memory. On next chat message, AI sees `[SETTINGS CHANGED]` block, acknowledges the changes naturally, and pending_changes is cleared. No extra message sent — just incorporated into the next response.
- **Intensity-aware nutrition goals** — Goal intensity (light/moderate/aggressive) now affects calorie targets. Light = ~300 cal deficit/surplus, moderate = ~500, aggressive = ~750+. When user changes intensity in profile settings, nutrition goals automatically recalculate via `/api/nutrition/recalculate`.
- **User profile context on every message** — AI coach now sees a `[USER PROFILE]` block on every message containing goal, intensity, height, weight, training split, split rotation, today's scheduled workout, and injuries. No longer needs to call tools to access this info.
- **Training split rotation awareness** — Coach calculates today's scheduled workout based on the user's split rotation and last logged workout. Morning greetings now say "back day today" instead of asking what they're training. Rotation supports any split (PPL, Upper/Lower, bro split, custom).
- **Adaptive split handling** — If user wants to do a different workout than scheduled, coach adapts without arguing. Missed days don't break the rotation — it continues from the last logged workout. Rest days in rotation are respected.
- **Cardio guidance for cutting** — System prompt now includes cardio recommendations scaled to intensity: light (optional 1-2x/week), moderate (2-3x/week LISS+HIIT), aggressive (4-5x/week + 10k daily steps). Includes HIIT vs LISS guidance and timing recommendations.

### Previous Updates (Mar 3)
- **Morning greeting fix** — The `checkAndGenerateOpening()` function was defined but never called. Added useEffect to invoke it after messages load, so users now get a personalized morning greeting when opening the coach tab on a new day.
- **Meal trigger batching** — Fixed duplicate messages when checking off multiple meals quickly. Meals logged within 3 seconds are now batched into a single coach response. Instead of 2 separate "protein is low" warnings, you get one unified message: "breakfast locked in: protein shake, rice cakes, fruit."
- **Meal trigger conversation context** — Coach-trigger now fetches the last 3 assistant messages before responding. If coach suggested specific foods and user logs those exact foods, the response acknowledges they followed through ("you executed the plan") instead of giving generic advice.
- **Activity-aware triggers** — Fixed trigger always suggesting more food. Now reads conversation context to understand meal purpose: if coach said "eat this before gym", next up is TRAINING, not more food. Respects schedules (class, work, gym) mentioned in recent conversation. "Next up" can now be training, class, or activities — not just meals.
- **Workout-aware triggers** — Trigger now queries today's workouts to know if user already trained. If workout is logged, meal is POST-WORKOUT (focus on recovery/next meal). If no workout yet, meal could be PRE-WORKOUT (next up is gym). Fixes "time to hit the gym" appearing after post-workout meals.

### Previous Updates (Mar 2)
- **Deterministic macro estimation** — Added `temperature: 0` to Haiku API call and USDA reference values in prompt. Same food + weight now returns identical macros every time. Reference values include chicken, beef, salmon, eggs, rice, oats, dairy, whey, bread, fruits (per 100g).
- **Coach-trigger protein logic fix** — Fixed contradictory responses like "protein target met" + "eat more protein." Now uses explicit conditional logic: protein HIT + late night = celebrate and close day; protein SHORT + late night = suggest specific snack with exact grams.
- **Coach-trigger timezone fix** — API was using server date (UTC) instead of client's local date, causing it to query meals from wrong day and report full protein goal as "remaining." Now passes `localDate` from client to API for correct meal lookup.
- **Auto-trigger time awareness** — Coach-trigger now passes `localTime` and `localHour` so Haiku knows time of day. End-of-day meals (7pm+) get "did you hit protein?" guidance instead of "what's next meal." Late night (9pm+) closes out the day instead of suggesting more food.
- **Macro estimation respects serving size** — If user enters a serving size before clicking "Estimate Macros", the API calculates macros for that exact amount instead of overwriting it with a default serving.
- **Auto-trigger system** — When users log meals or complete workouts, Haiku automatically generates a "next up" directive and saves it to chat. Badge appears on Coach tab until viewed. Uses database for persistence across sessions/devices.
- **Daily message counter** — Shows count of user messages sent today in coach header, resets at midnight.
- **Proactive momentum system** — Coach now automatically provides next-step directives after every interaction. Weight check-ins get full day plans, meal logs get "next up" instructions, workouts trigger recovery nutrition guidance. User never has to ask "what's next."

### Updates (Feb 27)
- **Elite trainer voice upgrade** — Coach persona shifted from casual "texting a friend" to elite personal trainer. Opens with punchy headlines, explains biological mechanisms instead of labeling foods, uses exact numbers, treats each interaction like a mission briefing.
- **Labeling vs mechanism examples** — Added explicit examples in system prompt showing bad (labeling) vs good (mechanism) food explanations.
- **Token limit increased** — Coaching responses now allow up to 2048 tokens (was 1024) to support the new narrative style.

### Updates (Feb 25)
- **Science-based coaching system** — Comprehensive upgrade to coach intelligence. Phase awareness (water weight, stalls, diet breaks), pattern recognition (5-7 day trends), progressive overload tracking, recovery signals, weekly check-ins. See "Science-Based Coaching System" section above.
- **Cutting calorie fix** — Coach no longer suggests eating more to "close the gap" during a cut. Calories are a ceiling, not a floor. Only flags if over calories or under protein.

### Updates (Feb 24)
- **Splash screen** (`src/components/splash-screen.tsx`) — Shows animated upward-trending line chart (like a stock chart) in cyan, then fades in "NetGainsAI" text. Displays for ~1.8 seconds on every fresh page load. Wrapped in `(app)/layout.tsx`.
- **Split folder reordering** — Users can reorder their workout split tiles using Move Up/Move Down buttons in the edit modal. Uses `order_index` field in `folders` table.
- **Edit Split modal UX** — Keyboard doesn't auto-open when tapping pencil icon, making Move Up/Down buttons easier to access on mobile.

### Beta Status
- Testing with dad & uncle
- Then 3-4 friends test for 3-5 days

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
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key (for client-side, subject to RLS)
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (for server-side, bypasses RLS) — **set in Vercel only, not in .env.local**
