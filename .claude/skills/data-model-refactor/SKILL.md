---
name: data-model-refactor
description: Refactor exercises to be tied to muscle groups instead of split days
---

# Data Model Refactor: Exercises → Muscle Groups (Option C)

This is a major architectural change. Exercises are being decoupled from split days and tied to muscle groups instead. Splits become display filters, not data containers. ALL existing workout history must be preserved.

## Pre-Flight Checks

Before writing ANY code:
1. Read the current schema: `supabase/schema.sql`
2. Read the current exercise-related components and API routes
3. Map every file that references exercises, splits, folders, or workout logging
4. Present a full architecture plan with every affected file listed
5. Get explicit approval before proceeding

## Data Model Changes

### Exercises Table Updates
- Add `muscle_group` column (enum or text): chest, back, biceps, triceps, front_delt, side_delt, rear_delt, quads, hamstrings, glutes, calves, abs, forearms
- Add `gym_id` foreign key referencing locations table
- Add `is_gym_specific` boolean (default true for machine/cable/smith, false for barbell/dumbbell/bodyweight)
- `muscle_group` becomes the primary organizational identity, NOT the split day

### Split Day Mapping
- Create a new table or JSONB structure: `split_day_muscle_groups`
- Each split day maps to one or more muscle groups (e.g., "Pull Day" → back, biceps, rear_delt)
- When a user opens a split day, query: `SELECT * FROM exercises WHERE muscle_group IN (day's muscle groups) AND (gym_id = current_gym OR is_gym_specific = false)`

### Migration Strategy
1. Populate `muscle_group` for every existing exercise based on current categorization/folder
2. Convert existing split day → exercise relationships into split day → muscle group mappings
3. DO NOT touch completed workout logs — they reference exercises by ID and will continue to work
4. Populate `gym_id` based on which location/folder the exercise currently belongs to
5. Set `is_gym_specific` based on equipment type: machine, cable, smith → true; barbell, dumbbell, bodyweight → false

## Files to Audit and Modify

Check ALL of these areas:
- `supabase/schema.sql` — schema changes
- `supabase/migrations/` — new migration file
- `src/app/(app)/log/` — workout logging pages
- `src/app/api/exercise/` — exercise API routes
- `src/app/api/workout/` — workout API routes
- `src/components/` — any component referencing exercises, splits, folders
- `src/lib/supabase/types.ts` — TypeScript types
- `src/app/(app)/stats/` — stats page queries

## Validation Checklist

After implementation, verify:
- [ ] Every existing exercise has a `muscle_group` assigned
- [ ] Every existing exercise has a `gym_id` assigned
- [ ] `is_gym_specific` is set correctly based on equipment type
- [ ] Split days map to muscle groups, not individual exercises
- [ ] Opening a split day shows the correct exercises for that gym
- [ ] Universal exercises (barbell, dumbbell) appear regardless of gym
- [ ] ALL existing workout history is intact and accessible
- [ ] Stats page still works correctly
- [ ] PRs are still calculated correctly
- [ ] No TypeScript errors in build
- [ ] npm run build succeeds

## Critical Rules

- NEVER delete or modify existing workout log data
- ALWAYS present the plan before writing code
- Run `npm run build` after changes to verify no errors
- If the migration fails or data looks wrong, STOP and report — do not try to fix it automatically
- Commit with message: "refactor: decouple exercises from splits, tie to muscle groups"
- Push to main only after all validation checks pass

## Rollback Plan

If something goes wrong:
1. The migration SQL should be reversible
2. Keep the old columns/relationships in place (mark deprecated) rather than dropping them
3. Old workout logs reference exercise IDs directly — these are safe regardless of organizational changes
