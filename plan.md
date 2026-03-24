# Data Model Refactor: Exercises → Muscle Groups

## Overview

Major architectural change: exercises are decoupled from split days and tied to muscle groups as their primary identity. Split days become mappings to muscle groups, not containers of individual exercises.

---

## Data Model Changes

### 1. Muscle Groups (Primary Identity)

**13 muscle groups:**
- chest, back, biceps, triceps, front_delt, side_delt, rear_delt, quads, hamstrings, glutes, calves, abs, forearms

**Note:** This differs from current schema which has: chest, front_delt, side_delt, rear_delt, lats, upper_back, biceps, triceps, quads, hamstrings, glutes, calves, core

**Changes:**
- `lats` + `upper_back` → `back`
- `core` → `abs`
- Add `forearms`

### 2. Exercise Templates Table Changes

```sql
-- Add gym_id (location reference)
ALTER TABLE public.exercise_templates
ADD COLUMN gym_id uuid REFERENCES public.locations ON DELETE SET NULL;

-- Add is_gym_specific flag
ALTER TABLE public.exercise_templates
ADD COLUMN is_gym_specific boolean DEFAULT true;

-- Update muscle_group constraint for new values
ALTER TABLE public.exercise_templates
DROP CONSTRAINT IF EXISTS exercise_templates_muscle_group_check;

-- muscle_group is already text[] (array) - no change needed
-- Just need to update the valid values during migration

-- Index for gym-based queries
CREATE INDEX IF NOT EXISTS idx_exercise_templates_gym_id ON public.exercise_templates(gym_id);
CREATE INDEX IF NOT EXISTS idx_exercise_templates_muscle_group ON public.exercise_templates USING GIN(muscle_group);
```

### 3. Exercises Table Changes (Workout Logs)

```sql
-- Add gym_id to logged exercises for PR separation
ALTER TABLE public.exercises
ADD COLUMN gym_id uuid REFERENCES public.locations ON DELETE SET NULL;

-- Add is_gym_specific (copied from template at log time)
ALTER TABLE public.exercises
ADD COLUMN is_gym_specific boolean DEFAULT true;

-- Index for PR queries
CREATE INDEX IF NOT EXISTS idx_exercises_gym_id ON public.exercises(gym_id);
```

### 4. Split Day → Muscle Group Mapping Table

```sql
CREATE TABLE public.split_muscle_groups (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles ON DELETE CASCADE NOT NULL,
  folder_id uuid REFERENCES public.folders ON DELETE CASCADE NOT NULL,
  muscle_groups text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(folder_id)
);

-- Indexes
CREATE INDEX idx_split_muscle_groups_user_id ON public.split_muscle_groups(user_id);
CREATE INDEX idx_split_muscle_groups_folder_id ON public.split_muscle_groups(folder_id);

-- RLS
ALTER TABLE public.split_muscle_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own split mappings"
  ON public.split_muscle_groups FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own split mappings"
  ON public.split_muscle_groups FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own split mappings"
  ON public.split_muscle_groups FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own split mappings"
  ON public.split_muscle_groups FOR DELETE
  USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE TRIGGER set_split_muscle_groups_updated_at
  BEFORE UPDATE ON public.split_muscle_groups
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
```

---

## Migration Strategy

### Phase 1: Schema Changes (non-destructive)

Run the SQL above to add columns and create new table.

### Phase 2: Populate `gym_id` on exercise_templates

```sql
-- Set gym_id from folder → location relationship
UPDATE public.exercise_templates et
SET gym_id = f.location_id
FROM public.folders f
WHERE et.folder_id = f.id
AND et.gym_id IS NULL;
```

### Phase 3: Set `is_gym_specific` on exercise_templates

```sql
-- Gym-specific: machine, cable, smith (equipment varies by gym)
-- Universal: barbell, dumbbell, bodyweight, plate (available everywhere)
UPDATE public.exercise_templates
SET is_gym_specific = CASE
  WHEN equipment IN ('machine', 'cable', 'smith') THEN true
  ELSE false
END;
```

### Phase 4: Migrate muscle_group values

```sql
-- Map old values to new values
UPDATE public.exercise_templates
SET muscle_group = ARRAY(
  SELECT CASE
    WHEN unnest = 'lats' THEN 'back'
    WHEN unnest = 'upper_back' THEN 'back'
    WHEN unnest = 'core' THEN 'abs'
    ELSE unnest
  END
  FROM unnest(muscle_group)
);

-- Remove duplicates (lats + upper_back both become back)
UPDATE public.exercise_templates
SET muscle_group = ARRAY(SELECT DISTINCT unnest FROM unnest(muscle_group));
```

### Phase 5: Populate split_muscle_groups from folder names

API endpoint will parse folder names (like "Push Day", "Pull Day", "Legs") and create mappings.

### Phase 6: Backfill gym_id on exercises (workout logs)

```sql
-- For existing logged exercises, infer gym from the workout's folder context
-- This requires joining through the session storage or template matching
-- Will be done via API migration script
```

---

## Affected Files

### Database/Schema
- [ ] `supabase/migrations/xxx_muscle_group_refactor.sql` — new migration

### TypeScript Types
- [ ] `src/lib/supabase/types.ts`
  - Add `gym_id`, `is_gym_specific` to ExerciseTemplate
  - Add `gym_id`, `is_gym_specific` to Exercise
  - Add SplitMuscleGroups type
  - Update MuscleGroup type union

### Constants
- [ ] `src/lib/constants.ts` — Add MUSCLE_GROUPS array

### Core UI Components

#### Exercise Picker (MAJOR CHANGES)
- [ ] `src/components/exercise-picker-modal.tsx`
  - Remove folder-based loading
  - Query by: `muscle_group overlaps split_mapping AND (gym_id = current OR is_gym_specific = false)`
  - "All" tab shows all exercises for current gym
  - Props need: `locationId`, `splitMuscleGroups`

#### Workout Session
- [ ] `src/components/workout-session.tsx`
  - Pass gym context to exercise picker
  - When saving workout, copy `gym_id` and `is_gym_specific` to logged exercises
  - Props need: `locationId`

#### Log Page
- [ ] `src/app/(app)/log/page.tsx`
  - Pass `locationId` through to WorkoutSession
  - Folder selection loads `split_muscle_groups` mapping

#### Split Management (NEW UI)
- [ ] `src/components/split-editor-modal.tsx` — **NEW FILE**
  - Assign muscle groups to split days
  - Preview how exercises will reorganize
  - Called when creating/editing folders

#### Stats Page (MAJOR CHANGES)
- [ ] `src/app/(app)/stats/page.tsx`
  - New hierarchy: gym → muscle group → exercise → history
  - PRs tracked per exercise + equipment
  - Gym-specific exercises: also separate by gym
  - Universal exercises: combined stats across gyms

### API Routes

#### New Endpoints
- [ ] `src/app/api/split-muscle-groups/route.ts` — CRUD for split mappings
- [ ] `src/app/api/migration/muscle-group-refactor/route.ts` — One-time migration

#### Modified Endpoints
- [ ] `src/app/api/exercise/categorize/route.ts`
  - Update valid muscle groups list
  - Map: back (not lats/upper_back), abs (not core), forearms (new)

- [ ] `src/app/api/exercise/parse-split/route.ts`
  - Update muscle group mappings

- [ ] `src/app/api/exercise/recategorize-all/route.ts`
  - Use new muscle groups

- [ ] `src/app/api/account/delete/route.ts`
  - Add `split_muscle_groups` to deletion list

---

## Query Patterns

### Old: Exercise Picker
```typescript
const { data } = await supabase
  .from("exercise_templates")
  .select("*")
  .eq("folder_id", folderId)
  .order("name");
```

### New: Exercise Picker
```typescript
// Get muscle groups for this split
const { data: splitMapping } = await supabase
  .from("split_muscle_groups")
  .select("muscle_groups")
  .eq("folder_id", folderId)
  .single();

// Get exercises matching muscle groups + gym
const { data: exercises } = await supabase
  .from("exercise_templates")
  .select("*")
  .eq("user_id", userId)
  .overlaps("muscle_group", splitMapping?.muscle_groups || [])
  .or(`gym_id.eq.${locationId},is_gym_specific.eq.false`)
  .order("name");
```

### Old: PR Query
```typescript
// PRs by exercise name + equipment
const key = `${exerciseName}::${equipment}`;
```

### New: PR Query
```typescript
// PRs by exercise name + equipment + (gym if gym-specific)
const key = isGymSpecific
  ? `${exerciseName}::${equipment}::${gymId}`
  : `${exerciseName}::${equipment}`;
```

---

## Stats Page Redesign

### New Hierarchy
```
Stats
├── [Select Gym Dropdown]
├── [Select Muscle Group] (filtered by exercises at this gym)
├── [Select Exercise] (filtered by muscle group + gym)
└── PR Card + History Chart
```

### PR Display Logic
- **Gym-specific exercise**: Show PR for this gym only
- **Universal exercise**: Show combined PR across all gyms
- **Comparison view**: "Your best at Main Gym: 225×5 | Your all-time best: 235×5"

---

## Split Management Flow

### Creating a New Split
1. User names the split (e.g., "Push Day")
2. User selects muscle groups: [chest, front_delt, triceps]
3. System shows preview: "12 exercises will appear in this split"
4. User confirms

### Switching Training Programs
1. User goes to "Manage Splits"
2. UI shows current day → muscle group mappings
3. User can reassign (e.g., move "side_delt" from Push to Shoulders)
4. Preview shows: "Side Delt exercises moving from Push to Shoulders"
5. User confirms

---

## Validation Checklist

After implementation:
- [ ] Every exercise_template has `gym_id` populated
- [ ] Every exercise_template has `is_gym_specific` set correctly
- [ ] Every exercise_template has `muscle_group` with new values (no lats/upper_back/core)
- [ ] Every folder has a `split_muscle_groups` entry
- [ ] Exercise picker shows correct exercises for gym + muscle groups
- [ ] Universal exercises appear regardless of gym
- [ ] ALL existing workout history is intact
- [ ] PRs work correctly (gym-specific separation)
- [ ] Stats page hierarchy works
- [ ] TypeScript compiles: `npm run build`
- [ ] No runtime errors

---

## Implementation Order

1. Create migration SQL file
2. Update TypeScript types
3. Update constants (muscle groups)
4. Run migration in Supabase
5. Create split-muscle-groups API
6. Create migration API endpoint
7. Run data migration (populate gym_id, muscle_group, split mappings)
8. Update exercise categorize/parse-split APIs
9. Update ExercisePickerModal
10. Update WorkoutSession (gym context, save gym_id to logs)
11. Update LogPage (pass location)
12. Create SplitEditorModal (muscle group assignment UI)
13. Update StatsPage (new hierarchy, gym-aware PRs)
14. Update account deletion
15. Test thoroughly
16. Commit: "refactor: decouple exercises from splits, tie to muscle groups"

---

## Risk Mitigation

1. **Keep folder_id**: Not dropping the column, just not using it for queries
2. **Additive migration**: Only adding columns, not removing
3. **Workout logs untouched**: The `exercises` table (workout logs) keeps working — we're just adding `gym_id` for new logs
4. **Rollback path**: If needed, can revert to folder_id queries

---

## Open Questions

1. **Muscle group list confirmation**:
   - back (combining lats + upper_back)
   - abs (was core)
   - forearms (new)
   - Is this the final list?

2. **Stats page redesign scope**: Full redesign or incremental? The hierarchy change (gym → muscle → exercise) is significant.

3. **Split editor timing**: Create new UI component, or modify existing folder creation flow?

4. **Universal exercise definition**: barbell, dumbbell, bodyweight, plate = universal. Correct?
