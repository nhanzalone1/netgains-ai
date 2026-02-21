# Food Staples Memory — Feature Spec

## Overview
Allow the coach to remember foods the user always has on hand ("staples") so it can give better nutrition recommendations without the user listing their options every session.

## Two Layers of Food Knowledge

### 1. Session-Level (already works — no changes needed)
User says "I have bagels, pork roast, and cantaloupe today" → coach uses those options for the rest of that conversation via normal chat context.

### 2. Persistent Staples (NEW — needs implementation)
User says "remember I always have whey protein" or "remember I keep eggs and brown rice stocked" → coach saves these to `coach_memory` and references them in every future session.

## Database

Use the existing `coach_memory` table. Add a new entry with:
- `memory_type`: `'food_staples'`
- `content`: JSON array of staple food items, e.g. `["whey protein", "brown rice", "eggs", "oats", "chicken breast"]`

There should be ONE `food_staples` row per user — upsert, don't create duplicates.

## Detection Logic (in system prompt)

Add instructions to the coach system prompt so it knows how to handle food-related memory:

```
FOOD MEMORY:
- If the user says "remember I have...", "I always keep...", "I always have...", "add ___ to my staples", or similar → call the save_food_staples tool to add those items to their persistent staples list
- If the user says "I have..." or "today I have..." or lists foods WITHOUT "remember"/"always" → treat as session-only, do not save
- If the user says "forget ___" or "remove ___ from my staples" → call save_food_staples to remove those items
- When giving nutrition advice, reference both the user's saved staples AND any foods they've mentioned in the current session
```

## Tool Definition

Add a new tool the coach can call:

### `save_food_staples`
```json
{
  "name": "save_food_staples",
  "description": "Add or remove items from the user's persistent food staples list. These are foods the user always has available.",
  "parameters": {
    "action": "add | remove | replace",
    "items": ["string array of food items"]
  }
}
```

- `add`: merge new items into existing staples list (deduplicate)
- `remove`: remove specified items from the list
- `replace`: overwrite the entire list (for when user says "my staples are actually just...")

## Tool Handler (in route.ts)

When the coach calls `save_food_staples`:

1. Fetch the current `food_staples` row from `coach_memory` for this user
2. If `action === 'add'`: merge new items into existing array, deduplicate (case-insensitive)
3. If `action === 'remove'`: filter out matching items (case-insensitive)
4. If `action === 'replace'`: use the new items array as-is
5. Upsert the `coach_memory` row with `memory_type = 'food_staples'`
6. Return confirmation to the coach so it can acknowledge to the user

## System Prompt Integration

When building the coach's system prompt context, pull the `food_staples` memory and include it:

```
USER'S FOOD STAPLES (always available):
whey protein, brown rice, eggs, oats, chicken breast
```

If no staples saved yet, omit this section entirely (don't show an empty list).

## Coach Behavior

- When user asks "what should I eat?" the coach should reference staples + any session foods
- Coach should naturally confirm when it saves: "got it, added whey protein and brown rice to your staples"
- Coach should NOT ask "do you want me to remember this?" — only save when the user explicitly uses "remember" / "always" language
- Keep it lightweight — no elaborate confirmations, just acknowledge and move on

## Files to Modify
- `src/app/api/chat/route.ts` — add tool definition, tool handler, pull staples into system prompt context
- `CLAUDE.md` — add note about food_staples memory type

## Files NOT to Modify
- No UI changes needed
- No new API routes needed
- No migration needed (uses existing coach_memory table)

## Testing
1. Send: "remember I always have whey protein and eggs" → should save to coach_memory
2. Start a new chat session → send "what should I eat?" → coach should reference whey protein and eggs without being told
3. Send: "remove eggs from my staples" → should update the list
4. Send: "I have leftover pasta today" → should NOT save (session only)
