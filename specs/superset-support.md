# Feature: Superset Support

## Problem

Supersets (two exercises performed back-to-back without rest) are a common training technique for:
- Time efficiency (shorter workouts)
- Increased intensity and metabolic stress
- Antagonist pairing (e.g., biceps/triceps)
- Pre-exhaust or post-exhaust protocols

Currently, users can't log supersets as linked pairs. If someone does bench press superseted with dumbbell flyes, they appear as separate, unrelated exercises. The coach has no awareness that these were performed together, which affects:
- Rest time interpretation (no rest between superset pairs)
- Programming advice (coach can't suggest or recognize superset patterns)
- Workout history context (can't query "show me my chest supersets")

## Current State

**What exists:**
- UI has superset pairing logic in `workout-session.tsx`:
  - `supersetPairId` field on `ActiveExercise` interface (line 48)
  - `startSuperset()` and `handleSupersetSelect()` functions (lines 555-565)
  - Visual styling: purple border, "SS1"/"SS2" badges, merged borders (lines 713-742)
  - Superset picker modal for selecting partner exercise
- Pairing is stored in localStorage during the session

**What's missing:**
- No database persistence — superset links are lost on save
- Coach doesn't know exercises were superseted
- No superset data in workout history queries

## Solution

### Database Changes

Add two columns to the `exercises` table:

```sql
ALTER TABLE exercises
ADD COLUMN superset_group_id TEXT,
ADD COLUMN superset_order INT DEFAULT 0;
```

- `superset_group_id`: UUID string shared by both exercises in a superset pair (null = not a superset)
- `superset_order`: 0 = first exercise, 1 = second exercise in the pair

**Why this approach over a linking table:**
- Simpler queries (no joins)
- Matches existing pattern (exercises already have `order_index`)
- Easier to extend to tri-sets (order 0, 1, 2) if needed later

### Saving Flow

In `handleSaveWorkout()` (`src/app/(app)/log/page.tsx`):

```typescript
// When inserting exercises, include superset fields
const exerciseInserts = activeExercises.map((ex, index) => ({
  workout_id: workoutId,
  name: ex.name,
  order_index: index,
  superset_group_id: ex.supersetPairId || null,
  superset_order: ex.supersetOrder || 0,
}));
```

The `supersetPairId` already exists in `ActiveExercise` — just needs to flow through to the insert.

### Loading Flow

When loading a workout for editing (if implemented) or viewing history:

```typescript
// Query includes superset fields
const { data: exercises } = await supabase
  .from("exercises")
  .select("id, name, order_index, superset_group_id, superset_order")
  .eq("workout_id", workoutId)
  .order("order_index");
```

### Coach Integration

**1. Update `formatWorkoutCompact()`** (`src/app/api/chat/route.ts`):

Current format:
```
Bench: 185x5, 185x5 | Incline DB: 50x8, 50x8 | Squats: 225x5
```

New format with supersets:
```
Bench [SS]: 185x5, 185x5 | Incline DB [SS]: 50x8, 50x8 | Squats: 225x5
```

Or grouped:
```
[SS: Bench 185x5, 185x5 + Incline DB 50x8, 50x8] | Squats: 225x5
```

Recommend the `[SS]` tag approach — minimal token overhead, clear signal to coach.

**2. Update `getRecentLifts()` tool** (line 875):

Include `superset_group_id` in the exercise query so coach can see historical superset patterns.

**3. System prompt addition:**

Add to coach context:
```
- Exercises marked [SS] were performed as supersets (back-to-back, no rest between)
- When suggesting workouts, you can recommend supersets for time efficiency or intensity
```

### UI Changes

**Minimal changes needed** — UI already handles supersets visually.

1. **Extract superset order**: When user selects second exercise in superset, set `supersetOrder: 1` on it (first exercise keeps `supersetOrder: 0`)

2. **Delete handling**: When deleting an exercise that's part of a superset:
   - Option A: Also delete the partner (disruptive)
   - Option B: Unlink the partner (convert to normal exercise) — **recommended**

3. **Superset indicator on history**: When viewing past workouts in stats, show superset pairing visually

### Type Updates

In `src/lib/supabase/types.ts`, update Exercise type:

```typescript
export interface Exercise {
  id: string;
  workout_id: string;
  name: string;
  order_index: number;
  superset_group_id: string | null;
  superset_order: number;
  created_at: string;
}
```

## Files to Modify

| File | Change |
|------|--------|
| `supabase/migrations/XX_add_superset_support.sql` | Add columns to exercises table |
| `src/lib/supabase/types.ts` | Add superset fields to Exercise type |
| `src/components/workout-session.tsx` | Set `supersetOrder` when pairing exercises |
| `src/app/(app)/log/page.tsx` | Include superset fields in exercise insert |
| `src/app/api/chat/route.ts` | Update `formatWorkoutCompact()` to add [SS] tags |
| `src/app/api/chat/route.ts` | Update `getRecentLifts()` to fetch superset_group_id |

## Testing

1. **Persistence roundtrip**: Create workout with superset, save, check DB has `superset_group_id` on both exercises
2. **Coach awareness**: Log a superset workout, ask coach "what did I do yesterday?", verify it mentions the superset
3. **Order preservation**: Verify first exercise has `superset_order: 0`, second has `superset_order: 1`
4. **Delete behavior**: Delete first exercise in superset, verify partner becomes normal exercise
5. **Non-superset unaffected**: Regular exercises still work, `superset_group_id` is null

## Out of Scope

- **Tri-sets / Giant sets**: Architecture supports it (order 0, 1, 2...) but UI not built. Phase 2.
- **Superset templates**: "Always superset bench with flyes" — future feature
- **Rest timer integration**: Auto-start timer after completing both exercises — future feature
- **Superset suggestions**: Coach proactively suggesting supersets based on time constraints — Phase 2

## Migration Notes

- Existing workouts will have `superset_group_id = null` and `superset_order = 0` (defaults)
- No data migration needed — this is additive
- RLS policies don't need changes (superset fields are on exercises table, already protected)

## Estimated Scope

Small-medium feature. Most UI work is already done. Primary effort is:
1. Migration file (~10 lines)
2. Save logic update (~15 lines)
3. Coach formatting (~20 lines)
4. Type updates (~5 lines)

The superset picker, visual styling, and pairing logic are already implemented and working.
