# Key Memories System + Coach Profile UI

Build a structured key memories system and editable Coach Profile that replaces the cluttered "What Coach Remembers" dump. This is the #1 user complaint — the coach forgets preferences like measurement units, supplement stacks, and available food.

## Pre-Flight Checks

Before writing ANY code:
1. Read the current profile schema and coach context in `src/app/api/chat/route.ts`
2. Read how Pinecone memories are currently retrieved and injected
3. Read the current user menu component
4. Present a plan with all affected files before proceeding

## Part A: Key Memories (Backend)

### Database
- Add `key_memories` JSONB column to profiles table with structure:
```json
{
  "supplements": "",
  "food_available": "",
  "preferences": "",
  "injuries": ""
}
```
- Default to empty object for new users
- Migration SQL must be provided for manual execution in Supabase

### API
- Create `/api/profile/key-memories` endpoint (GET and PUT)
- GET: returns current key_memories for authenticated user
- PUT: updates individual fields (partial update, not full replace)
- Validate auth token on both

### Coach Context Integration
- Fetch key_memories alongside profile data on EVERY coach message
- Include in context BEFORE Pinecone memories — these are higher priority
- Format clearly:
```
USER KEY PREFERENCES (always reference these):
Supplements: {supplements}
Food Available: {food_available}
Preferences: {preferences}
Injuries/Limitations: {injuries}
```
- If a field is empty, omit it from context (don't waste tokens on empty labels)

## Part B: Coach Profile UI

### New Page: Coach Profile
- Accessible from Settings (not the main profile dropdown)
- 4 free-text fields with placeholder examples:
  - Supplements: "e.g., creatine 5g daily, vitamin D 5000iu morning, fish oil with dinner"
  - Food Available: "e.g., dorm: protein powder, rice cakes, PB. Dining hall: fruit, bagels, grilled chicken always available"
  - Preferences: "e.g., grams not ounces, cardio after lifting, incline walk 8-10%"
  - Injuries/Limitations: "e.g., left shoulder clicks on overhead press, avoid behind-neck movements"
- Auto-save on blur (no save button needed)
- Show a subtle "Saved" confirmation when a field saves
- Match existing app design (dark theme, glassmorphism)

### Profile Dropdown Cleanup
- Keep lean: name/email, subscription tier, settings icon, sign out, delete account
- Settings page contains: training split, goal intensity, theme, measurement preference, link to Coach Profile
- Move "What Coach Remembers" — either remove entirely or put behind a "View all memories" debug link inside Coach Profile
- Move reload/reset button to Settings, rename to "Reset Coach"
- Reset Coach confirmation dialog: "This will clear your conversation history and coach memory. Your workout logs, nutrition data, stats, and account settings will not be affected. The coach will start fresh with no memory of past conversations. This is useful if the coach has outdated information or you want a fresh start."

## Part C: TypeScript Types

- Add key_memories to Profile type in types.ts
- Create KeyMemories interface:
```typescript
interface KeyMemories {
  supplements: string;
  food_available: string;
  preferences: string;
  injuries: string;
}
```

## Validation Checklist

After implementation, verify:
- [ ] key_memories column exists in profiles table
- [ ] /api/profile/key-memories GET and PUT work correctly
- [ ] Coach context includes key_memories on every message
- [ ] Empty fields are omitted from context
- [ ] Coach Profile page renders with all 4 fields
- [ ] Auto-save works on blur
- [ ] Profile dropdown is cleaned up (lean)
- [ ] "What Coach Remembers" is moved/hidden
- [ ] Reset Coach button is in Settings with confirmation dialog
- [ ] Reset Coach actually clears chat messages and Pinecone vectors
- [ ] npm run build succeeds with no errors

## Critical Rules

- Key memories must be fetched on EVERY coach message — this is non-negotiable
- Key memories take priority over Pinecone retrieved memories
- Auto-save should debounce (don't fire on every keystroke)
- The coach should NEVER ask for information that exists in key_memories
- Commit with message: "add key memories system and coach profile UI"
- Push to main after all validation checks pass
