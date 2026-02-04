# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start development server at localhost:3000
npm run build     # Build for production
npm run lint      # Run ESLint
```

## Architecture

NetGains is a fitness tracking PWA built with Next.js 14+ App Router, TypeScript, Tailwind CSS, and Supabase.

### Route Structure
- `src/app/(app)/` - Authenticated app routes with bottom navigation
  - `/program` - 5/3/1 cycle generator
  - `/log` - Workout logger
  - `/stats` - Progress charts
- `src/app/auth/` - Authentication routes (login, signup, callback)

### Core Features
- **Program Tab**: Implements the "Baechle Engine" - a 5/3/1 periodization calculator that generates 4-week lifting cycles from user's 1RM values
- **Log Tab**: Workout logger with exercise/set tracking and a plate calculator utility
- **Stats Tab**: Line charts showing strength progress over time (uses Recharts)

### Key Files
- `src/lib/baechle-engine.ts` - 5/3/1 program generation logic (training max calculation, week templates, cycle generation)
- `src/lib/plate-calculator.ts` - Calculates plate loading per side for target weights
- `src/lib/supabase/client.ts` - Browser Supabase client (typed)
- `src/lib/supabase/server.ts` - Server-side Supabase client with cookie handling
- `src/lib/supabase/middleware.ts` - Auth session refresh and route protection
- `src/lib/supabase/types.ts` - Database TypeScript types
- `src/middleware.ts` - Next.js middleware for auth protection
- `src/components/auth-provider.tsx` - React context for auth state

### Design System
- Dark theme only: Background `#0f0f13`, Cards `#1a1a24`, Primary `#ff4757`, Success `#2ed573`
- Minimum 44px touch targets for gym usability
- CSS variables defined in `globals.css`, exposed via Tailwind's `@theme inline`

### Supabase Setup

1. Create a Supabase project at supabase.com
2. Copy `.env.local.example` to `.env.local` and add credentials:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Run `supabase/schema.sql` in the Supabase SQL Editor to create tables

### Database Schema
- `profiles` - User profiles (auto-created on signup via trigger)
- `maxes` - User's 1RM values for squat/bench/deadlift/overhead
- `workouts` - Workout sessions with date
- `exercises` - Exercises within workouts
- `sets` - Weight/reps for each exercise set

All tables have RLS policies restricting access to the owning user.
