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
- **Email:** Resend (transactional emails)
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
│   │   ├── nutrition/         # estimate, recalculate
│   │   ├── waitlist/join/     # Waitlist signup + confirmation email
│   │   └── admin/invite-beta/ # Send beta invite emails
│   ├── login/ & signup/
├── components/
│   ├── workout-session.tsx    # Main workout logging UI
│   ├── exercise-picker-modal.tsx
│   ├── pending-workout-banner.tsx
│   └── ...
├── lib/
│   ├── supabase/        # DB client + types
│   ├── email.ts         # Resend email templates
│   ├── pr-detection.ts
│   └── date-utils.ts
└── constants.ts         # AI models, limits, defaults
```

## Database Tables

- **profiles** — user info (height, weight, goal, coaching_intensity, muscle_group_mode)
- **workouts** — workout sessions (date, notes)
- **exercises** — exercises in a workout (name, equipment, order_index)
- **sets** — individual sets (weight, reps, variant, measure_type)
- **nutrition_logs** — meals (name, calories, protein, carbs, fat, date)
- **coach_memory** — persistent state (split_rotation, food_staples, pending_workout, pending_changes)
- **chat_messages** — persisted chat for cross-device sync
- **exercise_templates** — user's exercises (name, equipment, muscle_group[], default_measure_type)

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
- **Formatting** — Short paragraphs, bold section headers on own lines with spacing above, no bullets. Chat UI renders `**bold**` as block elements with 24px top margin via custom ReactMarkdown component.

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
3. After profile complete + `app_tour_shown` false → interactive visual app tour
4. Profile "empty" if missing: `height_inches`, `weight_lbs`, or `goal`

### Interactive App Tour
After profile setup completes, an interactive spotlight tour walks users through the app:
- Coach says "alright, let me show you around" then tour starts
- Spotlight overlay highlights each nav tab (Log, Nutrition, Coach, Stats)
- Coach-voice tooltips explain each tab's purpose
- "Next" button progresses through steps, "Skip" exits early
- Final CTA: "Log your first workout" → navigates to Log tab
- Sets `app_tour_shown: true` on completion/skip
- Can be replayed from Settings (profile icon → "Replay App Tour")
- Components: `src/components/app-tour.tsx`, `src/hooks/use-app-tour.ts`

## Waitlist / Beta Access

- Non-logged-in → `/waitlist` page
- Logged-in + email in `allowed_testers` → full access
- Logged-in + not in `allowed_testers` → waitlist pending page
- Waitlist signup sends confirmation email automatically via Resend
- Beta invite email sent manually via `/api/admin/invite-beta`

### Sending Beta Invites
```bash
curl -X POST https://netgainsai.com/api/admin/invite-beta \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_API_SECRET" \
  -d '{"email": "user@example.com", "addToTesters": true}'
```
- `addToTesters: true` — adds to `allowed_testers` table AND sends email
- `addToTesters: false` — just sends email (if already added manually)

## Current State (Mar 12)

### What's Working
- Workout logging with set variants and time-based sets
- Nutrition logging with calorie ring
- AI coach chat with persistent memory
- Coach Workout Generator — ask for a workout, loads into Log pre-populated
- Dynamic Daily Brief
- PR detection (excludes warmup, separates by equipment)
- 15 message daily limit
- Exercise categorization with split-based tabs
- Waitlist & beta invite emails via Resend
- Scroll-to-bottom button in coach chat
- Interactive app tour after onboarding (replayable from settings)

### Recent Updates (Mar 12)
- **Interactive App Tour** — Spotlight-style onboarding tour after profile setup. Coach says "let me show you around" then visual tour highlights each nav tab with coach-voice tooltips. Uses clip-path spotlight overlay with cyan glow, glassmorphism tooltip cards, and Framer Motion animations. Ends with CTA to log first workout. Replayable from settings. Components: `app-tour.tsx`, `use-app-tour.ts`.
- **Equipment-based PR tracking** — PRs now separated by equipment type. Dumbbell lateral raise and machine lateral raise have independent PR tracking. Added `equipment` column to `exercises` table. Stats page filters out warmup sets and time-based sets from PR calculations. Migration: `supabase/migrations/add_exercise_equipment.sql`.
- **Visual polish pass** — Added micro-interactions and glow effects: active nav item glow, primary button gradient with hover glow (`.btn-primary`), input focus glow (`.input-glow`), notification badge pulse animation, text gradient on "AI" branding, skeleton shimmer animation (`.skeleton-shimmer`), glowing loading dots in coach, glowing calorie ring on nutrition page.

### Previous Updates (Mar 11)
- **Premium glassmorphism UI** — Overhauled dark theme inspired by Linear, Vercel, and Cal.ai. Deep near-black background (`#09090b`), radial gradient with subtle cyan glow, noise texture overlay, and glass utility classes (`.glass`, `.glass-elevated`, `.glass-subtle`). Cards and surfaces now feel like they float with backdrop blur (20-32px), semi-transparent backgrounds, visible borders, and layered shadows. Includes `prefers-reduced-motion` fallback. Updated: `globals.css`, bottom-nav, modals, folder cards, daily brief, coach bubbles.
- **Resend email integration** — Waitlist confirmation emails sent automatically on signup. Beta invite emails via `/api/admin/invite-beta`. Templates in `src/lib/email.ts`.
- **Scroll-to-bottom button** — Appears in coach chat when user scrolls up. Fixed bug where scroll listener wasn't attached due to conditional rendering.
- **Fixed shadcn styling issue** — shadcn init overwrote `globals.css` with light theme defaults and broke font variables. Reverted to original dark theme and fixed `--font-sans` to use `var(--font-geist-sans)`. Unused shadcn packages remain in `package.json` but can be removed.
- **Meal logging: suggestion vs reporting** — Coach now distinguishes between suggesting meals (asks "want me to log it?") vs user reporting what they ate (logs immediately). Prevents duplicates when user adjusts coach's suggestion to actual portions.
- **PWA icons** — Generated all required icons (192x192, 512x512, apple-touch-icon, favicons). Icon is upward trending line chart (gains) with cyan accent on dark background. Run `node scripts/generate-icons.mjs` to regenerate.
- **Toast notifications** — Replaced all `alert()` calls with native-feeling toast system (`useToast` hook). Toasts appear at top with slide animation, auto-dismiss, and support for retry actions. Component: `src/components/toast.tsx`.
- **Haptic feedback** — Added vibration feedback for native iOS/Android feel. Light tap on buttons, success/error patterns on toasts, success buzz on workout save. Utility: `src/lib/haptics.ts`.
- **Skeleton loaders** — Added loading skeletons to Log, Nutrition, and Stats pages. Reusable skeleton components in `src/components/ui/skeleton.tsx` (Skeleton, SkeletonCard, SkeletonList, SkeletonGymList, SkeletonNutrition, SkeletonStats).
- **Error retry buttons** — Toast errors for gym/split creation now include "Retry" buttons that re-invoke the failed action.

### Previous Updates (Mar 10)
- **Coach Workout Generator** — "give me a 45 min chest workout" → Coach generates, suggests folder, loads into Log. Tools: `generateWorkout`, `getSuggestedFolder`, `loadWorkoutToFolder`. Endpoint: `/api/workout/pending`. Component: `PendingWorkoutBanner`.
- **Time-based sets** — Bodyweight exercises can use seconds (plank, dead hang). `measure_type` column on sets.
- **Multi-select muscle groups** — Exercises belong to multiple groups. `muscle_group` is TEXT[].
- **Simple/Advanced mode** — Toggle between 6 or 17 muscle groups.
- **Meal timestamps** — Coach sees when each meal was logged (e.g., "7:02 PM: chicken breast"). Prevents "eat at 7 PM" when user just ate at 7 PM.
- **Duplicate meal detection** — Blocks logging same meal twice only if name AND calories match. Allows same food with different portions.

## Coding Conventions

- TypeScript strictly — no `any` unless unavoidable
- Error handling on every Supabase query and API call
- Use `constants.ts` for models, limits — never hardcode
- Use `formatLocalDate()` from `date-utils.ts` for dates
- Coach system prompt in `getSystemPrompt()` in `src/app/api/chat/route.ts`
- **Do NOT run `shadcn init`** — it overwrites `globals.css` with light theme defaults and breaks the app's dark theme. If adding shadcn components, copy them manually.

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
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (server-side, bypasses RLS)
- `RESEND_API_KEY` — Resend API key for transactional emails
- `ADMIN_API_SECRET` — Secret for admin API endpoints (beta invites)

**Vercel note:** Make sure env vars are added to the correct Vercel project (`netgains-ai`, not `netgains-ai-8qeb`).
