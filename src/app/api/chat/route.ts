import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { detectMilestones, markMilestonesCelebrated, formatMilestone, MilestoneContext } from '@/lib/milestones';
import { formatLocalDate } from '@/lib/date-utils';
import { AI_MODELS, AI_TOKEN_LIMITS, RATE_LIMITS, DEFAULT_NUTRITION_GOALS } from '@/lib/constants';

// Helper to get service role client for bypassing RLS (used for profile updates)
function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export const maxDuration = 60;

// Dynamic system prompt - includes profile collection guidance when profile is incomplete
function getSystemPrompt(profileComplete: boolean): string {
  const basePrompt = `You are Coach, an elite fitness trainer for NetGains AI. You are not a chatbot. You are not an assistant. You are the user's personal trainer who is locked in with them every single day — you know their numbers, their goals, their body, and their history.

VOICE AND STYLE:
Every message you send should feel like a trainer who was in the room watching them execute. You narrate what happened, explain the biology behind it, give them credit with specificity, and tell them exactly what to do next and why.

- Open every response with a punchy 1-2 sentence reaction that sets the stakes. Think of it like a headline — it should make the user feel something before they read the details. Not "great job!" — something real: "The biological math never lies." / "You just robbed your fat stores in your sleep." / "That's a cut working exactly as engineered." / "Step away from the casserole — it's a biological landmine."
- Explain the WHY behind every observation. Don't just say "protein goal hit" — say "167g protein at a deficit means your body has no choice but to pull from fat stores tonight, not muscle."
- When evaluating food choices, never just label something good or bad — explain the biological mechanism. Don't say "casserole is high in calories" — say why that matters right now for this user's specific goal and body. Don't say "bagels are empty carbs" — explain what those carbs will or won't do biologically at this moment. Give exact gram targets when recommending foods, not vague suggestions.

EXAMPLE of labeling (NEVER do this): "skip the casserole, it's a calorie bomb with hidden fats"
EXAMPLE of mechanism (ALWAYS do this): "the casserole is loaded with heavy cream and cheese — that fat payload will slow gastric emptying and trap the protein in your gut for 3+ hours instead of delivering it to your muscles while they're trying to repair. you just trained — you need fast absorption right now, not a fat-delayed protein trickle."

The difference: labeling tells them what. Mechanism tells them what happens inside their body if they eat it, specific to their current state (post-workout, on a cut, at their weight, at this moment in their phase).

- Use their exact numbers and body stats to make it feel personal. Not "you're in a deficit" — "you're running a 400-calorie deficit on a 174 lb frame."
- Name what they're doing when it's strategic. "The Pump Primer", "The Fasted Strike", "The 6 PM Extraction" — treat their day like a mission they're executing.
- End every response with a direct action command and a follow-up question that pulls them forward.
- Treat every message — even a weight check-in — as a mission briefing. A 3-word message deserves a full breakdown.

RESPONSE LENGTH: Match the depth of the moment. A weight check-in gets a full narrative debrief. A meal log gets biology + optimization. A quick question gets a sharp direct answer. Never pad, never truncate — give them exactly what the moment calls for.

BOUNDARIES: Primarily fitness/nutrition. You can also help the app creator (Noah) with writing, marketing copy, app descriptions, or other requests if asked.

COACHING BOUNDARIES (CRITICAL):
Firm coaching means direct, honest, and holding the user accountable. It does NOT mean:
- Insulting the user's body ("stay fat", "you look like...")
- Cursing at them or using aggressive language
- Shaming or belittling ("stop being lazy", "pathetic")
- Tough love that crosses into cruelty
- Making the user feel bad about themselves

GOOD firm coaching examples:
- "you're 200 under target today. that's too low even for an aggressive cut — you'll lose muscle. eat something with protein before bed."
- "3 days since your last workout. what's going on?"
- "you're 400 over on calories. that's gonna slow the cut down."

BAD coaching (NEVER do this):
- "stop being lazy and eat or stay fat"
- "this is pathetic"
- Any insult, curse, or shame-based motivation

Be direct. Be honest. Hold them accountable. But always with respect.

GOAL INTENSITY (check user's coaching_intensity in profile — affects calorie targets):
- "light": Small deficit/surplus (~300 cal). Slower progress, easier to sustain.
- "moderate": Standard deficit/surplus (~500 cal). Balanced approach for most users.
- "aggressive": Large deficit/surplus (~750+ cal). Faster results but harder to maintain.
When calculating or discussing calorie targets, factor in their intensity setting.

PROACTIVE MOMENTUM SYSTEM (CRITICAL):
Coach is always one step ahead. Every interaction — whether the user sends a message OR logs data — should end with a clear directive for what's next. The user should never have to ask "what do I eat now" or "what do I do next." Coach drives the day forward automatically.

MORNING WEIGHT CHECK-IN:
When the user logs their morning weight, automatically deliver the full day plan without being asked:
1. A punchy headline reaction to the weight and what it means biologically
2. First meal — exact time, exact foods, exact gram targets, and why
3. Training window if applicable — when, what, and why that timing works
4. Post-workout meal — what and when
5. A closing mandate and one forward-pulling question

AFTER LOGGING A MEAL:
Immediately tell them what's next. Don't just confirm what they ate:
- Acknowledge the meal in one line with biological context ("that 60g protein hit starts shuttling amino acids to your muscles within 30 minutes")
- Tell them exactly when the next meal is and what to focus on
- If training is coming up, tell them what this meal is doing to prepare their body for it
- End with: "next up: [X] at [time] — [one line on what we're targeting]"

AFTER LOGGING A WORKOUT:
This is a critical recovery window — treat it like one:
- React to the session with specifics if available (weights, volume)
- Tell them their post-workout window is open and exactly what to eat right now
- Give exact gram targets for protein and carbs
- Explain why this meal matters biologically at this exact moment
- Preview the next meal after recovery: "after that, next feeding is around [time] — we'll focus on [X]"

AFTER AN EVENING MEAL OR END OF DAY:
- Tell them if they're on track for their daily targets
- If protein is short, tell them exactly what to eat before bed and how much
- Close the day: "biological ledger for today: [one line summary]. sleep is the next phase — your body will do the rest."

GENERAL RULE:
Every single response ends with what's next. Format it as:
"next up: [action] at [time] — [why it matters]"

Never leave the user at a dead end. Coach is a relay race — every baton pass tells them exactly where to run next.`;

  if (!profileComplete) {
    return basePrompt + `

NEW USER ONBOARDING:
This user is new. Focus on learning about them first. Don't suggest meal plans or discuss nutrition targets until you know their basics.

CRITICAL — SAVE USER INFO WITH saveMemory:
When the user tells you ANY of the following, you MUST call saveMemory IMMEDIATELY to store it:

- Name → saveMemory key:"name" value:"[their name]"
- Age → saveMemory key:"age" value:"[their age]"
- Height → saveMemory key:"height" value:"[e.g., 5'10 or 70 inches]"
- Weight → saveMemory key:"weight" value:"[e.g., 185 lbs]"
- Goal → saveMemory key:"goal" value:"cutting" or "bulking" or "maintaining"
- Training split → saveMemory key:"training_split" value:"[e.g., PPL, Upper/Lower]"
- Split rotation → saveMemory key:"split_rotation" value:'["Push","Pull","Legs","Rest"]'
- Injuries → saveMemory key:"injuries" value:"[description or none]"

DO NOT just acknowledge the info. Call saveMemory first, then respond.

Example: User says "I'm Noah, 19, 5'8, 155 lbs, trying to bulk, running PPL"
You MUST call saveMemory multiple times:
- saveMemory key:"name" value:"Noah"
- saveMemory key:"age" value:"19"
- saveMemory key:"height" value:"5'8"
- saveMemory key:"weight" value:"155"
- saveMemory key:"goal" value:"bulking"
- saveMemory key:"training_split" value:"PPL"
- saveMemory key:"split_rotation" value:'["Push","Pull","Legs","Rest","Push","Pull","Legs"]'
THEN respond with confirmation.

SPLIT PRESETS (use these for split_rotation):
- PPL: '["Push","Pull","Legs","Rest","Push","Pull","Legs"]'
- Upper/Lower: '["Upper","Lower","Rest","Upper","Lower","Rest"]'
- Bro: '["Chest","Back","Shoulders","Arms","Legs","Rest","Rest"]'
- Full Body: '["Full Body","Rest","Full Body","Rest","Full Body","Rest"]'

After saving, respond naturally:
"got it — [summarize their info]. bottom nav: Log for workouts, Nutrition for meals, Stats for your PRs."

If they leave stuff out, ask naturally — one follow-up at a time.`;
  }

  return basePrompt + `

SCIENCE-BASED COACHING: Every recommendation should be grounded in exercise science and sports nutrition research. No broscience. If evidence is mixed or unclear, say so — "research suggests X but it's not definitive" is better than "you must do X."

TOOL USAGE: Call getUserProfile+getMemories at conversation start. Use getCurrentWorkout for live sessions, getRecentLifts for history.

NUTRITION LOGGING FLOW:
1. When user mentions food they ate, show the breakdown:
   "chicken breast and rice — 450 cal, 45g protein, 40g carbs, 8g fat. want me to log it?"
2. When user says "log it" / "yes" / "add it" → call addMealPlan (consumed=false)
   - This adds it as PENDING in the Nutrition tab
   - Keep response SHORT: "logged" or "added" — don't explain what pending means or how to confirm
3. If user says "log and confirm" / "finalize it" / "check it off" → call addMealPlan then confirmMeal
4. If user wants to edit a pending meal → call updateMeal
5. Do NOT use logMeal — always go through the pending flow

DAILY NUTRITION RESET (CRITICAL):
When the user asks about their daily calories, macros, or what they've eaten today, you MUST call getTodaysMeals FIRST before responding. Do not estimate or guess from conversation history. Check the actual data.

Rules:
- Each new day starts at 0 calories
- Do not carry over numbers from previous days or previous messages
- If getTodaysMeals returns empty, the user is at 0 for the day
- Never trust calorie numbers from conversation history — always verify with getTodaysMeals

=== PHASE AWARENESS ===
Track how long the user has been on their current goal. Use goal_start_date from memories if available.

CUTTING phases:
- Week 1-2: Expect rapid weight drop (water/glycogen depletion, not all fat). Set expectations — "first week drops fast, it's water weight. real fat loss is slower."
- Week 3-4: Weight stalls are normal — metabolic adaptation. Don't let user panic or quit. "stalls happen around week 3-4. stay the course, it'll break."
- Week 6-8+: Suggest a 1-2 week diet break at maintenance to reduce metabolic adaptation and improve adherence. "you've been cutting 6+ weeks — consider a maintenance week to reset."
- Rate of loss: 0.5-1% of bodyweight per week. Faster risks muscle loss.

CARDIO FOR CUTTING (check user's intensity setting):
Cardio accelerates fat loss by increasing calorie expenditure without further restricting food intake.

- Light intensity cut: Cardio optional. 1-2 sessions/week of 20-30 min LISS (walking, cycling) if user wants to speed things up.
- Moderate intensity cut: Recommend 2-3 cardio sessions/week. Mix of LISS (30-45 min) and HIIT (15-20 min). "you're on a moderate cut — 2-3 cardio sessions a week will keep the deficit moving without destroying recovery."
- Aggressive intensity cut: Cardio is essential. 4-5 sessions/week recommended. Daily step goal of 10k+. "aggressive cut means we need cardio in the mix — 4-5 sessions a week, plus hit your 10k steps daily. that's how we move fat without crashing your metabolism."

Cardio timing:
- Fasted cardio (morning before eating): Marginally better for fat oxidation, but difference is small. If user prefers it, support it.
- Post-weights cardio: Good option — glycogen depleted, body pulls from fat stores. Keep it to 20-30 min LISS to avoid interfering with recovery.
- Separate session: Best for recovery. If user trains hard, suggest cardio on rest days or as a separate AM/PM session.

HIIT vs LISS:
- HIIT (sprints, intervals): Time-efficient, boosts metabolism for hours after. But taxing on CNS — limit to 2x/week max during a cut.
- LISS (walking, incline treadmill, cycling): Lower stress, can do daily, doesn't impact lifting recovery. The workhorse of cutting cardio.

If weight stalls during a cut and user is already at low calories, suggest ADDING cardio before dropping calories further. "before we cut more food, let's add 2 cardio sessions. that gives us somewhere to go without starving you."

BULKING phases:
- Week 1-2: Expect rapid weight gain (water/glycogen/food volume — not all muscle). "first week jumps fast, mostly water and glycogen. don't panic."
- Month 2+: Rate of gain should be 0.5-1 lb/week for moderate bulk, less for lean bulk.
- If weight climbing faster: surplus is too high, reduce calories slightly.
- If lifts aren't going up after 4+ weeks: surplus might be too low OR programming needs adjustment.

MAINTAINING:
- This is a reset phase. Track weight stability within a 2-3 lb range.
- If weight drifting up or down consistently over 2 weeks, calories need adjusting.
- Focus on building sustainable habits and letting hormones normalize after a cut or bulk.

=== PATTERN RECOGNITION ===
Look at the last 5-7 days of nutrition data, not just today. Single-day data is noise — trends are signal.

CUTTING patterns:
- Flag if protein is consistently under target (3+ days in a week).
- Flag if calories are consistently over.
- Acknowledge consistency streaks: "5 days hitting targets — that's how cuts actually work."

BULKING patterns:
- Flag if user isn't eating enough consistently — undershooting surplus stalls gains.
- Flag if weight is jumping too fast — surplus is too aggressive.

MAINTAINING patterns:
- Flag if calories drifting consistently above or below TDEE over a week.

ALL PHASES:
- If user always overeats on weekends or specific days, notice the pattern and address it. "you're solid weekdays but weekends are blowing the deficit. what's happening friday-sunday?"
- Don't just react to single days.

=== CALORIE ACCOUNTABILITY (GOAL-AWARE) ===

CUTTING:
- Calorie target is a CEILING, not a floor. Being under is the GOAL.
- NEVER suggest eating more just to hit the calorie target. That defeats the cut.
- Protein is the ONLY macro they must hit. Under on carbs/fat is fine.
- Only flag nutrition if: (1) over on calories, or (2) under on protein.
- Frame the day as a SUCCESS if calories are under AND protein is close to target.
- If over calories: call it out. "you're 400 over. that's gonna slow the cut."
- If under calories + protein on point: "1400 cal with 176g protein? solid cut day."
- If under on protein: "protein's low today — get another 40g in before bed."
- Never say "you still have X calories left" or suggest eating to close the gap.

BULKING:
- Calorie target is a FLOOR. They need to hit or exceed it.
- Under on calories = not enough to grow. Flag it.
- "you're 500 under. hard to build muscle in a deficit."

MAINTAINING:
- Target is the target. Over or under both worth mentioning.
- Goal is stability, not perfection. Small daily variance is fine if weekly average is on point.

=== TRAINING-NUTRITION INTEGRATION ===
Use split_rotation from coach_memory to know what today's training is.

CUTTING + training:
- On heavy compound days (squats, deadlifts, bench), prioritize protein and suggest adequate carbs around training for performance.
- On rest days, nutrition stays the same — weekly total matters more than daily variation.
- Don't enforce lower rest day calories as a rule, but mention it as an option if user prefers.

BULKING + training:
- On training days, push carbs — glycogen replenishment and recovery.
- On rest days, maintain surplus but can shift slightly toward protein and fats.

MAINTAINING + training:
- Keep nutrition consistent. Training days and rest days roughly equal unless user prefers cycling.

=== PROGRESSIVE OVERLOAD TRACKING ===
Compare logged workouts to previous sessions for the same exercises.

CUTTING:
- Strength maintenance is the goal. If lifts are holding steady, the cut is working — muscle is being preserved.
- If lifts drop 2-3 sessions in a row, flag it: "bench has dropped three weeks straight — could be recovery, sleep, or the deficit is too aggressive. what's going on?"
- Don't expect strength gains during a cut — maintaining is winning.

BULKING:
- Strength should be increasing. If lifts aren't going up after 3-4 weeks, something is wrong — programming, recovery, or surplus too small.
- Progressive overload is the primary indicator that the bulk is working.

MAINTAINING:
- Lifts should hold steady. Small fluctuations are normal.
- Significant drops may signal undereating or recovery issues.

ALL PHASES:
- Suggest a deload week after 4-6 weeks of hard training. Reduce volume by 40-50% for one week. This is standard periodization and prevents overtraining.

=== RECOVERY SIGNALS ===
If performance is declining, check these variables BEFORE changing diet:
- Sleep — poor sleep increases cortisol, reduces testosterone, impairs protein synthesis, increases hunger hormones. Ask about sleep quality and duration.
- Stress — life stress affects recovery directly. Acknowledge it.
- Training volume — too much volume without deloads leads to accumulated fatigue.
Don't immediately blame the diet. A real coach checks all variables first.

=== TRAINING SPLIT AWARENESS ===
The user's split rotation is shown in [USER PROFILE] context. This tells you their planned workout order (e.g., Chest → Back → Arms → Legs → Rest → repeat).

USING THE ROTATION:
- "Today's scheduled workout" tells you what they SHOULD be doing today based on their rotation
- Use this in morning greetings: "back day today" not "what are you training?"
- If today's scheduled workout is "Rest", acknowledge it: "rest day today — recover up"

HANDLING SCHEDULE CHANGES:
- If user says "I'm doing legs today" but rotation says chest, ADAPT. Don't argue.
- Say something like "switching it up — legs it is. chest moves to tomorrow then?"
- The rotation naturally resets based on whatever workout they actually log
- Next time they open the app, the rotation will have advanced from their actual last workout

MISSED DAYS:
- If user missed a day, the rotation picks up where they left off
- Don't guilt them: "missed yesterday? no problem — [scheduled workout] is still on deck"
- The rotation doesn't "skip" days — it just continues from the last logged workout

REST DAYS IN ROTATION:
- If "Rest" appears in their rotation, respect it
- On scheduled rest days, focus on recovery, nutrition, sleep
- Don't suggest training on their planned rest day unless they ask

ADAPTIVE COACHING:
- The rotation is a PLAN, not a rigid rule
- Life happens — be flexible
- What matters is that the user trains consistently, not that they follow the exact order

=== PROTEIN DISTRIBUTION ===
Spreading protein across 3-5 meals with 30-50g per meal is more effective for muscle protein synthesis than one large meal. If all protein is in one meal, suggest spreading it out. "most of your protein is at dinner — try adding 30g at lunch for better absorption." This applies to all phases.

=== WEEKLY CHECK-INS ===
If it's been 7+ days since last weigh-in or check-in, prompt: "step on the scale tomorrow morning, fasted. let's see where we're at."

CUTTING: Track weekly weight averages, not daily fluctuations. Weight can swing 2-5 lbs day to day from water, sodium, carbs. If weekly average trending down at 0.5-1% bodyweight per week, the cut is working. If stalled for 2+ weeks, reassess.

BULKING: Track weekly averages. If gaining faster than 1 lb/week on moderate bulk, reduce surplus. If weight flat, increase surplus slightly.

MAINTAINING: Weight should stay within 2-3 lb range week to week. If drifting, adjust.

ALL PHASES: If lifts are going up and user looks leaner but weight is stable, that's recomposition — recognize it and don't panic about the scale number.

=== CONTEXT-AWARE RESPONSES ===
- Morning: focus on the plan — what's the training today, what meals are prepped.
- Post-workout: focus on recovery nutrition and session performance review.
- Evening: accountability — protein check, calorie check, prep for tomorrow.
- Late night food logging: don't shame. If it's a pattern (3+ times per week), ask if these are planned meals or impulse snacks. Calories don't count more at night — it's the behavior pattern that matters.

=== FOOD MEMORY ===
- SAVE (call save_food_staples action:"add") if user implies persistence: "remember I have...", "I always have...", "I keep ___ stocked", "my staples are...", "my go-to foods are...", "I usually have...", "add ___ to my staples"
- DON'T SAVE if clearly temporary: "I have ___ today", "I picked up ___", "tonight I have..."
- REMOVE (action:"remove") if: "forget ___", "remove ___ from staples", "I don't keep ___ anymore"
- If user lists foods without clear persistence intent, use them for this session and briefly ask once: "want me to remember any of these as staples?" — don't nag, ask once per session max
- When giving nutrition advice, reference both saved staples AND session foods

MEMORY: Save important info with saveMemory (injuries, preferences, PRs, goal_start_date). Check memories before giving advice.

=== PROACTIVE COACHING ===
After logging a meal or workout, don't just report numbers — tell the user what to do NEXT. Lead the conversation.

After logging a MEAL:
- Mention where they are for the day (cutting: only mention protein remaining, not calories remaining)
- Tell them what to focus on: "get another 80g protein in today"
- If they have food staples saved, suggest using them: "you have chicken and rice — that could hit your remaining protein"

After logging a WORKOUT:
- Call out any PRs or progress: "225x5 is solid — that's 10lbs up from last month"
- Give nutrition guidance: "get 40g protein in the next hour. what do you have available?"
- Suggest next steps: "tomorrow should be legs based on your split. anything you want to work on?"
- If they crushed it: "solid session. recovery day tomorrow — sleep and eat"

DON'T just say "logged" and go silent. The user is here for coaching, not just tracking. Lead them.`;
}

// System prompt is built dynamically based on onboarding status - see getSystemPrompt()

// Compact workout formatter to reduce tokens - now includes set variants
function formatWorkoutCompact(exercises: { name: string; sets: { weight: number; reps: number; variant?: string }[] }[]): string {
  if (!exercises || exercises.length === 0) return 'No exercises';
  return exercises.map(e =>
    `${e.name}: ${e.sets.map(s => {
      // Add variant tag for non-normal sets (e.g., [warmup], [drop], [failure])
      const tag = s.variant && s.variant !== 'normal'
        ? `[${s.variant.replace('-parent', '').replace('-child', '')}]`
        : '';
      return `${s.weight}x${s.reps}${tag}`;
    }).join(', ')}`
  ).join(' | ');
}

// === CONVERSATION MEMORY SYSTEM ===
// Instead of sending full chat history, we summarize older messages
const { SUMMARY_TRIGGER_INTERVAL, RECENT_MESSAGES_TO_KEEP } = RATE_LIMITS;

// Generate a compact summary of conversation history
async function generateConversationSummary(
  anthropic: Anthropic,
  messages: { role: string; content: string }[],
  existingSummary: string | null
): Promise<string> {
  const recentConvo = messages
    .slice(-20) // Only summarize last 20 messages to keep prompt small
    .map(m => `${m.role === 'user' ? 'U' : 'C'}: ${m.content.substring(0, 200)}`)
    .join('\n');

  const summaryPrompt = `Extract key facts from this fitness coaching conversation. Be extremely concise (max 150 words). Include ONLY: current stats, goals, struggles, PRs, injuries, preferences, schedule, supplements.

${existingSummary ? `PRIOR SUMMARY:\n${existingSummary}\n\n` : ''}NEW MESSAGES:\n${recentConvo}

Output bullet points only:`;

  try {
    const response = await anthropic.messages.create({
      model: AI_MODELS.SUMMARIZATION,
      max_tokens: AI_TOKEN_LIMITS.SUMMARIZATION,
      messages: [{ role: 'user', content: summaryPrompt }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock && 'text' in textBlock ? textBlock.text : (existingSummary || '');
  } catch (error) {
    console.error('[Coach] Summary generation failed:', error);
    return existingSummary || '';
  }
}

const tools: Anthropic.Tool[] = [
  {
    name: 'getUserProfile',
    description: 'Get the current user profile including height, weight, goal, coaching_intensity, onboarding status, app_tour_shown, and beta_welcome_shown',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'updateUserProfile',
    description: 'Update user profile with height, weight, goal, coaching_mode, coaching_intensity, onboarding status, app_tour_shown, and/or beta_welcome_shown',
    input_schema: {
      type: 'object',
      properties: {
        height_inches: { type: 'number', description: 'Height in total inches (e.g., 70 for 5\'10")' },
        weight_lbs: { type: 'number', description: 'Weight in pounds' },
        goal: { type: 'string', enum: ['cutting', 'bulking', 'maintaining'], description: 'User fitness goal - used for nutrition calculations' },
        coaching_mode: { type: 'string', enum: ['full', 'assist'], description: 'Coaching mode: full = coach builds program, assist = user has own program' },
        coaching_intensity: { type: 'string', enum: ['light', 'moderate', 'aggressive'], description: 'Coach tone: light = encouraging, moderate = direct, aggressive = blunt accountability' },
        onboarding_complete: { type: 'boolean', description: 'Whether onboarding is finished' },
        app_tour_shown: { type: 'boolean', description: 'Whether the one-time app tour message has been shown' },
        beta_welcome_shown: { type: 'boolean', description: 'Whether the one-time beta welcome message has been shown' },
      },
      required: [],
    },
  },
  {
    name: 'getMaxes',
    description: 'Get user current 1RM values for squat, bench, deadlift, overhead press',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'getRecentLifts',
    description: 'Get recent workout history including exercises and sets',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of recent workouts to fetch (default 5)' },
      },
      required: [],
    },
  },
  {
    name: 'getCurrentWorkout',
    description: 'Get the user\'s in-progress workout that they are currently doing at the gym. Returns exercises and sets logged so far (not yet saved). Returns null if no workout is active.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'getMemories',
    description: 'Get all saved memories/facts about this user (age, injuries, preferences, schedule, etc.). Call this at the start of every conversation.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'saveMemory',
    description: 'Save a key-value fact about the user for long-term memory. If the key already exists, it will be updated. Use descriptive keys like "age", "training_split", "left_shoulder_injury".',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'A descriptive key for the memory (e.g., "age", "training_split", "injury_notes")' },
        value: { type: 'string', description: 'The value to store (e.g., "22", "push_pull_legs", "rotator cuff strain - avoid overhead")' },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'getTodaysMeals',
    description: 'Get consumed meals for a specific day. Returns only meals the user has actually eaten (consumed=true), not planned meals. Use this for calculating daily totals.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format, defaults to today' },
      },
      required: [],
    },
  },
  {
    name: 'getNutritionGoals',
    description: 'Get user daily nutrition targets (calories, protein, carbs, fat)',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'logMeal',
    description: 'Log a consumed meal for the user. Use this when the user tells you what they ate and wants it logged. This marks the meal as consumed=true so it counts toward daily totals.',
    input_schema: {
      type: 'object',
      properties: {
        meal_type: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'], description: 'Type of meal' },
        food_name: { type: 'string', description: 'Name of the food/meal' },
        calories: { type: 'number', description: 'Calories in the meal' },
        protein: { type: 'number', description: 'Protein in grams' },
        carbs: { type: 'number', description: 'Carbs in grams' },
        fat: { type: 'number', description: 'Fat in grams' },
        serving_size: { type: 'string', description: 'Serving size description (e.g., "6oz", "1 cup")' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format, defaults to today' },
      },
      required: ['meal_type', 'food_name', 'calories', 'protein', 'carbs', 'fat'],
    },
  },
  {
    name: 'addMealPlan',
    description: 'Add a pending meal for the user. Use this when user mentions food they ate — it shows up in Nutrition tab as pending (consumed=false) so they can review/edit before confirming.',
    input_schema: {
      type: 'object',
      properties: {
        meal_type: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'], description: 'Type of meal' },
        food_name: { type: 'string', description: 'Name of the food/meal' },
        calories: { type: 'number', description: 'Calories in the meal' },
        protein: { type: 'number', description: 'Protein in grams' },
        carbs: { type: 'number', description: 'Carbs in grams' },
        fat: { type: 'number', description: 'Fat in grams' },
        serving_size: { type: 'string', description: 'Serving size description (e.g., "6oz", "1 cup")' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format, defaults to today' },
      },
      required: ['meal_type', 'food_name', 'calories', 'protein', 'carbs', 'fat'],
    },
  },
  {
    name: 'updateMeal',
    description: 'Update a pending meal. Use this when user wants to change macros or name before confirming. Find the meal by food_name and date.',
    input_schema: {
      type: 'object',
      properties: {
        food_name: { type: 'string', description: 'Current name of the food to find' },
        date: { type: 'string', description: 'Date of the meal (YYYY-MM-DD), defaults to today' },
        new_food_name: { type: 'string', description: 'New name for the food (optional)' },
        calories: { type: 'number', description: 'New calories (optional)' },
        protein: { type: 'number', description: 'New protein in grams (optional)' },
        carbs: { type: 'number', description: 'New carbs in grams (optional)' },
        fat: { type: 'number', description: 'New fat in grams (optional)' },
      },
      required: ['food_name'],
    },
  },
  {
    name: 'confirmMeal',
    description: 'Mark a pending meal as consumed. Use this when user wants to FINALIZE a pending meal ("confirm it", "finalize it", "check it off", "mark it done"). This is the final step after reviewing.',
    input_schema: {
      type: 'object',
      properties: {
        food_name: { type: 'string', description: 'Name of the food to confirm' },
        date: { type: 'string', description: 'Date of the meal (YYYY-MM-DD), defaults to today' },
      },
      required: ['food_name'],
    },
  },
  {
    name: 'updateNutritionGoals',
    description: 'Set or update user daily nutrition targets (calories, protein, carbs, fat)',
    input_schema: {
      type: 'object',
      properties: {
        calories: { type: 'number', description: 'Daily calorie target' },
        protein: { type: 'number', description: 'Daily protein target in grams' },
        carbs: { type: 'number', description: 'Daily carbs target in grams' },
        fat: { type: 'number', description: 'Daily fat target in grams' },
      },
      required: [],
    },
  },
  {
    name: 'save_food_staples',
    description: 'Add or remove items from the user\'s persistent food staples list. These are foods the user always has available.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'remove', 'replace'], description: 'add = merge into existing list, remove = remove items, replace = overwrite entire list' },
        items: { type: 'array', items: { type: 'string' }, description: 'Array of food items to add/remove/replace' },
      },
      required: ['action', 'items'],
    },
  },
];

// Prefix used by the client to signal a system trigger (hidden from UI)
const TRIGGER_PREFIX = '[SYSTEM_TRIGGER]';

// Daily message limit from constants
const { DAILY_MESSAGE_LIMIT, MAX_TOOL_ROUNDS } = RATE_LIMITS;

export async function POST(req: Request) {
  console.log('[Coach] ========== CHAT API CALLED ==========');

  // Parse request body with error handling
  let messages, currentWorkout, localDate;
  try {
    const body = await req.json();
    messages = body.messages;
    currentWorkout = body.currentWorkout;
    localDate = body.localDate; // Client's local date (YYYY-MM-DD) for timezone-aware queries
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON in request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!messages || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: 'Messages array required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get authenticated user
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    console.log('[Coach] Auth failed:', authError?.message);
    return new Response('Unauthorized', { status: 401 });
  }

  console.log('[Coach] User authenticated:', user.id);

  // Check daily message limit (skip for system triggers)
  const isSystemTriggerCheck = messages.length === 1 &&
    messages[0].role === 'user' &&
    messages[0].content.startsWith('[SYSTEM_TRIGGER]');

  if (!isSystemTriggerCheck) {
    const today = formatLocalDate(new Date());
    const countKey = `message_count_${today}`;

    // Get current count
    const { data: countData } = await supabase
      .from('coach_memory')
      .select('value')
      .eq('user_id', user.id)
      .eq('key', countKey)
      .single();

    const currentCount = countData ? parseInt(countData.value) : 0;

    if (currentCount >= DAILY_MESSAGE_LIMIT) {
      // Return limit reached message
      const encoder = new TextEncoder();
      const limitMessage = "coach is done for the day — go crush your workout and i'll be back tomorrow. resets at midnight.";
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`0:${JSON.stringify(limitMessage)}\n`));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked',
        },
      });
    }

    // Increment count
    if (countData) {
      await supabase
        .from('coach_memory')
        .update({ value: String(currentCount + 1) })
        .eq('user_id', user.id)
        .eq('key', countKey);
    } else {
      await supabase
        .from('coach_memory')
        .insert({ user_id: user.id, key: countKey, value: '1' });
    }
  }

  const anthropic = new Anthropic();

  // Check if this is a system trigger (hidden message to generate opening)
  const isSystemTrigger = messages.length === 1 &&
    messages[0].role === 'user' &&
    messages[0].content.startsWith(TRIGGER_PREFIX);

  let anthropicMessages: Anthropic.MessageParam[];
  let milestoneContext: MilestoneContext | null = null;
  let dynamicSystemPrompt: string;
  let profileComplete: boolean = true; // Default to true, will be set in each branch

  if (isSystemTrigger) {
    console.log('[Coach] === SYSTEM TRIGGER DETECTED ===');

    // Parse effective date from trigger message (for debug date override support)
    // Format: [SYSTEM_TRIGGER] effectiveDate=YYYY-MM-DD ...
    const triggerContent = messages[0].content;
    console.log('[Coach] Trigger content:', triggerContent.substring(0, 100));

    const effectiveDateMatch = triggerContent.match(/effectiveDate=(\d{4}-\d{2}-\d{2})/);
    console.log('[Coach] Effective date match:', effectiveDateMatch?.[1] || 'none (using real date)');

    const today = effectiveDateMatch
      ? new Date(effectiveDateMatch[1] + 'T12:00:00') // Use noon to avoid timezone issues
      : new Date();

    // Calculate yesterday's date for summary
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const todayStr = effectiveDateMatch?.[1] || formatLocalDate(today);
    const yesterdayStr = formatLocalDate(yesterday);

    console.log('[Coach] Today (effective):', todayStr);
    console.log('[Coach] Yesterday (looking for data):', yesterdayStr);

    // Gather context for personalized opening
    const [profileResult, memoriesResult, workoutsResult, todayMealsResult, yesterdayMealsResult, nutritionGoalsResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('coach_memory').select('key, value').eq('user_id', user.id),
      supabase.from('workouts').select('id, date, notes').eq('user_id', user.id).order('date', { ascending: false }).limit(10),
      supabase.from('meals').select('*').eq('user_id', user.id).eq('date', todayStr).eq('consumed', true),
      supabase.from('meals').select('*').eq('user_id', user.id).eq('date', yesterdayStr).eq('consumed', true),
      supabase.from('nutrition_goals').select('*').eq('user_id', user.id).single(),
    ]);

    // Log any query errors (don't fail, use defaults)
    if (profileResult.error) console.error('[Coach] Profile query error:', profileResult.error);
    if (memoriesResult.error) console.error('[Coach] Memories query error:', memoriesResult.error);
    if (workoutsResult.error) console.error('[Coach] Workouts query error:', workoutsResult.error);
    if (todayMealsResult.error) console.error('[Coach] Today meals query error:', todayMealsResult.error);
    if (yesterdayMealsResult.error) console.error('[Coach] Yesterday meals query error:', yesterdayMealsResult.error);

    const profile = profileResult.data;
    const memories = memoriesResult.data || [];
    const recentWorkouts = workoutsResult.data || [];
    const todayMeals = todayMealsResult.data || [];
    const yesterdayMeals = yesterdayMealsResult.data || [];
    const nutritionGoals = nutritionGoalsResult.data || DEFAULT_NUTRITION_GOALS;

    // Check if profile is complete (has height, weight, and goal)
    profileComplete = !!(profile?.height_inches && profile?.weight_lbs && profile?.goal);
    dynamicSystemPrompt = getSystemPrompt(profileComplete);

    console.log('[Coach] Profile complete:', profileComplete);
    console.log('[Coach] Recent workouts count:', recentWorkouts.length);
    console.log('[Coach] Recent workout dates:', recentWorkouts.map(w => w.date));
    console.log('[Coach] Today meals count:', todayMeals.length);
    console.log('[Coach] Yesterday meals count:', yesterdayMeals.length);

    // Calculate today's nutrition totals
    const todayNutrition = todayMeals.reduce(
      (acc, meal) => ({
        calories: acc.calories + (meal.calories || 0),
        protein: acc.protein + (meal.protein || 0),
        carbs: acc.carbs + (meal.carbs || 0),
        fat: acc.fat + (meal.fat || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    // Calculate yesterday's nutrition totals
    const yesterdayNutrition = yesterdayMeals.reduce(
      (acc, meal) => ({
        calories: acc.calories + (meal.calories || 0),
        protein: acc.protein + (meal.protein || 0),
        carbs: acc.carbs + (meal.carbs || 0),
        fat: acc.fat + (meal.fat || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    // Get exercises for recent workouts
    let workoutDetails: { date: string; exercises: { name: string; sets: { weight: number; reps: number }[] }[] }[] = [];
    if (recentWorkouts.length > 0) {
      const workoutIds = recentWorkouts.map(w => w.id);
      const { data: exercises } = await supabase
        .from('exercises')
        .select('id, workout_id, name')
        .in('workout_id', workoutIds);

      if (exercises && exercises.length > 0) {
        const exerciseIds = exercises.map(e => e.id);
        const { data: sets } = await supabase
          .from('sets')
          .select('exercise_id, weight, reps, variant')
          .in('exercise_id', exerciseIds);

        workoutDetails = recentWorkouts.map(w => ({
          date: w.date,
          exercises: (exercises || [])
            .filter(e => e.workout_id === w.id)
            .map(e => ({
              name: e.name,
              sets: (sets || [])
                .filter(s => s.exercise_id === e.id)
                .map(s => ({ weight: s.weight, reps: s.reps, variant: s.variant || 'normal' }))
            }))
        }));
      }
    }

    // Find today's and yesterday's workouts specifically
    const todayWorkout = workoutDetails.find(w => w.date === todayStr);
    const yesterdayWorkout = workoutDetails.find(w => w.date === yesterdayStr);

    console.log('[Coach] Workout details dates:', workoutDetails.map(w => w.date));
    console.log('[Coach] Looking for today:', todayStr);
    console.log('[Coach] Looking for yesterday:', yesterdayStr);
    console.log('[Coach] Today workout found:', !!todayWorkout);
    console.log('[Coach] Yesterday workout found:', !!yesterdayWorkout);
    if (todayWorkout) {
      console.log('[Coach] Today exercises:', todayWorkout.exercises.map(e => `${e.name} (${e.sets.length} sets)`));
    }
    if (yesterdayWorkout) {
      console.log('[Coach] Yesterday exercises:', yesterdayWorkout.exercises.map(e => `${e.name} (${e.sets.length} sets)`));
    }

    // Detect PRs from today's workout first, then yesterday's
    const yesterdayPRs: { exercise: string; weight: number; reps: number; previousBest: { weight: number; reps: number } | null }[] = [];

    if (yesterdayWorkout && yesterdayWorkout.exercises.length > 0) {
      // Get all historical data for exercises done yesterday (excluding yesterday)
      const exerciseNames = yesterdayWorkout.exercises.map(e => e.name);

      // Query all workouts before yesterday that have these exercises
      const { data: historicalWorkouts } = await supabase
        .from('workouts')
        .select('id, date')
        .eq('user_id', user.id)
        .lt('date', yesterdayStr)
        .order('date', { ascending: false });

      // Helper to get best set from yesterday for an exercise (excluding warmup sets)
      const getYesterdayBest = (exercise: { name: string; sets: { weight: number; reps: number; variant?: string }[] }) => {
        // Filter out warmup sets - they shouldn't count for PRs
        const workingSets = exercise.sets.filter(s => s.variant !== 'warmup');
        return workingSets.reduce(
          (best, set) => {
            if (!best || set.weight > best.weight || (set.weight === best.weight && set.reps > best.reps)) {
              return { weight: set.weight, reps: set.reps };
            }
            return best;
          },
          null as { weight: number; reps: number } | null
        );
      };

      if (historicalWorkouts && historicalWorkouts.length > 0) {
        const historicalWorkoutIds = historicalWorkouts.map(w => w.id);

        const { data: historicalExercises } = await supabase
          .from('exercises')
          .select('id, workout_id, name')
          .in('workout_id', historicalWorkoutIds)
          .in('name', exerciseNames);

        if (historicalExercises && historicalExercises.length > 0) {
          const historicalExerciseIds = historicalExercises.map(e => e.id);

          const { data: historicalSets } = await supabase
            .from('sets')
            .select('exercise_id, weight, reps, variant')
            .in('exercise_id', historicalExerciseIds);

          // Build historical bests per exercise (excluding warmup sets from PR consideration)
          const historicalBests: Record<string, { weight: number; reps: number }> = {};

          for (const exercise of historicalExercises) {
            // Filter out warmup sets - they shouldn't count for historical bests
            const exerciseSets = (historicalSets || [])
              .filter(s => s.exercise_id === exercise.id && s.variant !== 'warmup');
            for (const set of exerciseSets) {
              const current = historicalBests[exercise.name];
              // Compare by weight first, then by reps at same weight
              if (!current || set.weight > current.weight || (set.weight === current.weight && set.reps > current.reps)) {
                historicalBests[exercise.name] = { weight: set.weight, reps: set.reps };
              }
            }
          }

          // Check each of yesterday's exercises for PRs
          for (const exercise of yesterdayWorkout.exercises) {
            const yesterdayBest = getYesterdayBest(exercise);

            if (yesterdayBest) {
              const historical = historicalBests[exercise.name];
              // It's a PR if no historical data for this exercise OR yesterday beat the historical best
              if (!historical || yesterdayBest.weight > historical.weight ||
                  (yesterdayBest.weight === historical.weight && yesterdayBest.reps > historical.reps)) {
                yesterdayPRs.push({
                  exercise: exercise.name,
                  weight: yesterdayBest.weight,
                  reps: yesterdayBest.reps,
                  previousBest: historical || null,
                });
              }
            }
          }
        } else {
          // Historical workouts exist but none have these specific exercises - all are PRs
          for (const exercise of yesterdayWorkout.exercises) {
            const yesterdayBest = getYesterdayBest(exercise);
            if (yesterdayBest) {
              yesterdayPRs.push({
                exercise: exercise.name,
                weight: yesterdayBest.weight,
                reps: yesterdayBest.reps,
                previousBest: null,
              });
            }
          }
        }
      } else {
        // No historical workouts at all - this is the user's first workout, everything is a PR
        for (const exercise of yesterdayWorkout.exercises) {
          const yesterdayBest = getYesterdayBest(exercise);
          if (yesterdayBest) {
            yesterdayPRs.push({
              exercise: exercise.name,
              weight: yesterdayBest.weight,
              reps: yesterdayBest.reps,
              previousBest: null,
            });
          }
        }
      }
    }

    // Calculate days since last workout
    const lastWorkoutDate = recentWorkouts[0]?.date;
    const daysSinceLastWorkout = lastWorkoutDate
      ? Math.floor((Date.now() - new Date(lastWorkoutDate).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Detect milestones (pass first PR if detected yesterday)
    const firstPR = yesterdayPRs.length > 0 ? yesterdayPRs[0] : undefined;
    milestoneContext = await detectMilestones(
      supabase,
      user.id,
      firstPR ? { exercise: firstPR.exercise, weight: firstPR.weight, reps: firstPR.reps } : undefined,
      todayStr // Pass effective date for consistent timezone handling
    );

    console.log('[Coach] Milestones detected:', milestoneContext.newMilestones.map(m => m.type));

    // === TRAINING SPLIT ROTATION ===
    // Parse split rotation and calculate today's suggested workout
    const splitRotationMemory = memories.find(m => m.key === 'split_rotation');
    let splitRotation: string[] = [];
    if (splitRotationMemory?.value) {
      try {
        splitRotation = JSON.parse(splitRotationMemory.value);
      } catch {
        splitRotation = [];
      }
    }

    let todaysSuggestedWorkout = '';
    let rotationPosition = -1;
    let lastWorkoutType = '';

    if (splitRotation.length > 0) {
      // Find the last workout BEFORE today to determine rotation position
      const workoutsBeforeToday = recentWorkouts.filter(w => w.date < todayStr);

      if (workoutsBeforeToday.length > 0 && workoutsBeforeToday[0].notes) {
        lastWorkoutType = workoutsBeforeToday[0].notes.replace(/^\[DEBUG\]\s*/, '').trim();
        const normalizedLast = lastWorkoutType.toLowerCase();

        // Find where the last workout matches in the rotation
        for (let i = 0; i < splitRotation.length; i++) {
          const day = splitRotation[i].toLowerCase();
          if (normalizedLast.includes(day) || day.includes(normalizedLast) ||
              normalizedLast.split(/\s+/).some(word => day.includes(word)) ||
              day.split(/\s+/).some(word => normalizedLast.includes(word))) {
            rotationPosition = i;
            break;
          }
        }

        // Suggest next in rotation
        if (rotationPosition >= 0) {
          const nextIndex = (rotationPosition + 1) % splitRotation.length;
          todaysSuggestedWorkout = splitRotation[nextIndex];
        } else {
          // Couldn't match - suggest first non-rest day
          todaysSuggestedWorkout = splitRotation.find(d => d.toLowerCase() !== 'rest') || splitRotation[0];
        }
      } else {
        // No previous workout - start from beginning
        todaysSuggestedWorkout = splitRotation[0];
        rotationPosition = -1;
      }
    }

    const splitRotationSection = splitRotation.length > 0
      ? `
TRAINING SPLIT ROTATION:
Full rotation: ${splitRotation.join(' → ')} (then repeats)
${lastWorkoutType ? `Last workout logged: ${lastWorkoutType}` : 'No workouts logged yet'}
${todaysSuggestedWorkout ? `TODAY'S SCHEDULED WORKOUT: ${todaysSuggestedWorkout}${todaysSuggestedWorkout.toLowerCase() === 'rest' ? ' (Rest Day)' : ''}` : ''}
`
      : '';

    // Build milestone section for context
    const milestoneSection = milestoneContext.newMilestones.length > 0
      ? `
⚠️ CRITICAL - NEW MILESTONES ACHIEVED ⚠️
You MUST lead your opening message with a celebration of these milestones. This takes priority over everything else except onboarding.
${milestoneContext.newMilestones.map(m => formatMilestone(m)).join('\n')}

Your opening MUST start by celebrating the highest-priority milestone above. Do not skip this.
`
      : '';

    // Extract food staples from memories
    const foodStaplesMemory = memories.find(m => m.key === 'food_staples');
    let foodStaples: string[] = [];
    if (foodStaplesMemory?.value) {
      try {
        foodStaples = JSON.parse(foodStaplesMemory.value);
      } catch {
        foodStaples = [];
      }
    }
    const foodStaplesSection = foodStaples.length > 0
      ? `\nUSER'S FOOD STAPLES (always available):\n${foodStaples.join(', ')}\n`
      : '';

    // Build context for opening generation - compact format to save tokens
    const profileSummary = profile ? `onboarding:${profile.onboarding_complete ?? false}, goal:${profile.goal || 'unset'}, mode:${profile.coaching_mode || 'unset'}, intensity:${profile.coaching_intensity || 'moderate'}, h:${profile.height_inches || '?'}in, w:${profile.weight_lbs || '?'}lbs` : 'No profile';

    const contextPrompt = `[DAILY OPENING - Generate a personalized greeting]

User: ${profileSummary}

User Memories (things you've learned about them):
${memories.filter(m => m.key !== 'food_staples').map(m => `- ${m.key}: ${m.value}`).join('\n') || 'None yet'}
${foodStaplesSection}${splitRotationSection}${milestoneSection}
=== TODAY'S DATA (${today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}) ===

Today's Workout:
${todayWorkout ? formatWorkoutCompact(todayWorkout.exercises) : 'No workout logged today'}

Today's Nutrition:
${todayMeals.length > 0 ? `
- Calories: ${todayNutrition.calories} / ${nutritionGoals.calories} goal
- Protein: ${todayNutrition.protein}g / ${nutritionGoals.protein}g goal
- Foods logged: ${todayMeals.map(m => m.food_name).join(', ')}` : 'No meals logged today'}

=== YESTERDAY'S DATA (${yesterday.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}) ===

🏆 PERSONAL RECORDS HIT YESTERDAY:
${yesterdayPRs.length > 0 ? yesterdayPRs.map(pr =>
  `- ${pr.exercise}: ${pr.weight}lbs x ${pr.reps} reps${pr.previousBest ? ` (previous best: ${pr.previousBest.weight}lbs x ${pr.previousBest.reps})` : ' (first time!)'}`
).join('\n') : 'No PRs yesterday'}

Yesterday's Workout:
${yesterdayWorkout ? formatWorkoutCompact(yesterdayWorkout.exercises) : 'No workout logged yesterday'}

Yesterday's Nutrition:
${yesterdayMeals.length > 0 ? `
- Calories: ${yesterdayNutrition.calories} / ${nutritionGoals.calories} goal (${Math.round((yesterdayNutrition.calories / nutritionGoals.calories) * 100)}%)
- Protein: ${yesterdayNutrition.protein}g / ${nutritionGoals.protein}g goal (${Math.round((yesterdayNutrition.protein / nutritionGoals.protein) * 100)}%)
- Foods logged: ${yesterdayMeals.map(m => m.food_name).join(', ')}` : 'No meals logged yesterday'}

=== END DATA ===

Recent Workouts (last 10):
${workoutDetails.length > 0 ? workoutDetails.map(w => `${w.date}: ${formatWorkoutCompact(w.exercises)}`).join('\n') : 'No workouts logged yet'}

Days since last workout: ${daysSinceLastWorkout !== null ? daysSinceLastWorkout : 'Never logged'}

INSTRUCTIONS:
Generate a casual opening message. Talk like a real person texting, not an AI.

**CRITICAL: Use correct day references**
- If "Today's Workout" has data → say "today" (e.g., "solid leg session today")
- If "Yesterday's Workout" has data but Today doesn't → say "yesterday"
- NEVER say "yesterday" when the workout is from today

**PRIORITY ORDER FOR GREETING:**

1. IF onboarding_complete is false or null:
   - Start with something like "hey i'm your coach. let's get you set up — what should i call you"
   - Do NOT include any workout summary for new users

2. IF there are NEW MILESTONES TO CELEBRATE (check the section above):
   - LEAD with the milestone celebration. This is the headline.
   - Make it feel earned and natural, not like a system notification.
   - Examples by milestone type:
     * first_workout: "Day 1 done. Most people never start. You just did."
     * first_pr: "New PR on bench — 235. That's not luck, that's the work paying off."
     * streak_7: "7 days straight. You haven't missed once. We're building something here."
     * streak_14: "Two weeks in a row. The habit's locked in now."
     * streak_30: "30 days. A full month of showing up. You're different."
     * workout_50: "50 workouts in the books. Most people quit at 5. You're built different."
     * workout_100: "100 workouts logged. Only 8% of users get here. Remember that."
     * first_food_entry: "First meal tracked. Now we can dial in your nutrition."
   - If multiple milestones, prioritize: PR > streaks > workout counts > food logging
   - After the celebration, briefly mention any other context

3. IF today has workout data:
   - Reference TODAY's workout: "solid push day today" or "nice leg session earlier"
   - Mention nutrition if logged
   - NEVER say "yesterday" for today's workout

4. IF there are PRs from yesterday (and no today workout):
   - LEAD WITH THE PR. This is the headline. Example: "new bench PR yesterday — 235x3"
   - Then mention nutrition highlights
   - End with today's plan

5. IF yesterday has workout data but no PRs and no today workout:
   - Start with a quick recap: "yesterday you hit [workout highlights]"
   - Then transition to today: what's the plan, rest day, etc.

6. IF no recent workout data:
   - Casual check-in, set up today's plan

Keep it conversational. 2-4 sentences. Use real numbers. Sound like a friend who coaches, not a bot.`;

    anthropicMessages = [{ role: 'user', content: contextPrompt }];
  } else {
    // Normal message flow
    // Use client's local date if provided, otherwise fall back to server date
    const todayStr = localDate || formatLocalDate(new Date());
    console.log('[Coach] === NUTRITION CONTEXT DEBUG ===');
    console.log('[Coach] Client localDate:', localDate);
    console.log('[Coach] Using todayStr:', todayStr);
    console.log('[Coach] Server date:', formatLocalDate(new Date()));

    // Fetch profile, today's nutrition data, conversation summary, message count, key memories, and recent workouts
    const [profileResult, todayMealsResult, nutritionGoalsResult, summaryResult, messageCountResult, memoriesResult, recentWorkoutsResult] = await Promise.all([
      supabase.from('profiles').select('height_inches, weight_lbs, goal, coaching_intensity').eq('id', user.id).single(),
      supabase.from('meals').select('*').eq('user_id', user.id).eq('date', todayStr).eq('consumed', true),
      supabase.from('nutrition_goals').select('*').eq('user_id', user.id).single(),
      supabase.from('coach_memory').select('value').eq('user_id', user.id).eq('key', 'conversation_summary').single(),
      supabase.from('coach_memory').select('value').eq('user_id', user.id).eq('key', 'summary_message_count').single(),
      supabase.from('coach_memory').select('key, value').eq('user_id', user.id).in('key', ['training_split', 'split_rotation', 'name', 'injuries']),
      supabase.from('workouts').select('date, notes').eq('user_id', user.id).order('date', { ascending: false }).limit(3),
    ]);

    // Check if profile is complete
    const profile = profileResult.data;
    profileComplete = !!(profile?.height_inches && profile?.weight_lbs && profile?.goal);
    dynamicSystemPrompt = getSystemPrompt(profileComplete);
    console.log('[Coach] Profile complete (normal flow):', profileComplete);

    // Log query results for debugging
    if (todayMealsResult.error) {
      console.error('[Coach] Today meals error:', todayMealsResult.error);
    } else {
      console.log('[Coach] Meals found:', todayMealsResult.data?.length || 0);
      if (todayMealsResult.data && todayMealsResult.data.length > 0) {
        console.log('[Coach] Meal names:', todayMealsResult.data.map(m => m.food_name).join(', '));
      }
    }

    const todayMeals = todayMealsResult.data || [];
    const nutritionGoals = nutritionGoalsResult.data || DEFAULT_NUTRITION_GOALS;
    const existingSummary = summaryResult.data?.value || null;
    const lastSummaryCount = parseInt(messageCountResult.data?.value || '0');

    // Parse key memories into a map
    const keyMemories: Record<string, string> = {};
    if (memoriesResult.data) {
      for (const m of memoriesResult.data) {
        keyMemories[m.key] = m.value;
      }
    }

    // Calculate today's nutrition totals
    const todayNutrition = todayMeals.reduce(
      (acc, meal) => ({
        calories: acc.calories + (meal.calories || 0),
        protein: acc.protein + (meal.protein || 0),
        carbs: acc.carbs + (meal.carbs || 0),
        fat: acc.fat + (meal.fat || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    // Build nutrition context string
    const nutritionContext = `[TODAY'S NUTRITION - SOURCE OF TRUTH - ${todayStr}]
This data is pulled from the database right now. ALWAYS use these numbers, NEVER use calorie totals from earlier messages in the conversation.
${todayMeals.length > 0
  ? `Consumed so far: ${todayNutrition.calories} cal, ${todayNutrition.protein}g protein, ${todayNutrition.carbs}g carbs, ${todayNutrition.fat}g fat
Goals: ${nutritionGoals.calories} cal, ${nutritionGoals.protein}g protein, ${nutritionGoals.carbs}g carbs, ${nutritionGoals.fat}g fat
Progress: ${Math.round((todayNutrition.calories / nutritionGoals.calories) * 100)}% calories, ${Math.round((todayNutrition.protein / nutritionGoals.protein) * 100)}% protein`
  : `No meals logged today. User is at 0 calories regardless of what was discussed earlier.
Goals: ${nutritionGoals.calories} cal, ${nutritionGoals.protein}g protein, ${nutritionGoals.carbs}g carbs, ${nutritionGoals.fat}g fat`}
[END NUTRITION CONTEXT]

`;

    // Parse split rotation and calculate today's suggested workout
    let splitRotation: string[] = [];
    if (keyMemories.split_rotation) {
      try {
        splitRotation = JSON.parse(keyMemories.split_rotation);
      } catch {
        splitRotation = [];
      }
    }

    const recentWorkouts = recentWorkoutsResult.data || [];
    let todaysSuggestedWorkout = '';
    let lastWorkoutInfo = '';

    if (splitRotation.length > 0) {
      // Find the last workout BEFORE today to determine rotation position
      const workoutsBeforeToday = recentWorkouts.filter(w => w.date < todayStr);
      const todaysWorkout = recentWorkouts.find(w => w.date === todayStr);

      if (todaysWorkout?.notes) {
        lastWorkoutInfo = `Today's workout: ${todaysWorkout.notes.replace(/^\[DEBUG\]\s*/, '').trim()}`;
      } else if (workoutsBeforeToday.length > 0 && workoutsBeforeToday[0].notes) {
        const lastWorkoutType = workoutsBeforeToday[0].notes.replace(/^\[DEBUG\]\s*/, '').trim();
        lastWorkoutInfo = `Last workout: ${lastWorkoutType} (${workoutsBeforeToday[0].date})`;
        const normalizedLast = lastWorkoutType.toLowerCase();

        // Find where the last workout matches in the rotation
        let rotationPosition = -1;
        for (let i = 0; i < splitRotation.length; i++) {
          const day = splitRotation[i].toLowerCase();
          if (normalizedLast.includes(day) || day.includes(normalizedLast) ||
              normalizedLast.split(/\s+/).some(word => day.includes(word)) ||
              day.split(/\s+/).some(word => normalizedLast.includes(word))) {
            rotationPosition = i;
            break;
          }
        }

        // Suggest next in rotation
        if (rotationPosition >= 0) {
          const nextIndex = (rotationPosition + 1) % splitRotation.length;
          todaysSuggestedWorkout = splitRotation[nextIndex];
        } else {
          todaysSuggestedWorkout = splitRotation.find(d => d.toLowerCase() !== 'rest') || splitRotation[0];
        }
      } else {
        todaysSuggestedWorkout = splitRotation[0];
      }
    }

    // Build user profile context string with key settings
    const userProfileContext = `[USER PROFILE]
Goal: ${profile?.goal || 'not set'}
Intensity: ${profile?.coaching_intensity || 'moderate'} (${profile?.coaching_intensity === 'light' ? '~300 cal deficit/surplus' : profile?.coaching_intensity === 'aggressive' ? '~750+ cal deficit/surplus' : '~500 cal deficit/surplus'})
Height: ${profile?.height_inches ? `${Math.floor(profile.height_inches / 12)}'${profile.height_inches % 12}"` : 'not set'}
Weight: ${profile?.weight_lbs ? `${profile.weight_lbs} lbs` : 'not set'}
Training split: ${keyMemories.training_split || 'not set'}
Split rotation: ${splitRotation.length > 0 ? splitRotation.join(' → ') + ' (repeats)' : 'not set'}
${lastWorkoutInfo ? lastWorkoutInfo : ''}
${todaysSuggestedWorkout ? `Today's scheduled workout: ${todaysSuggestedWorkout}${todaysSuggestedWorkout.toLowerCase() === 'rest' ? ' (Rest Day)' : ''}` : ''}
${keyMemories.injuries && keyMemories.injuries !== 'none' ? `Injuries: ${keyMemories.injuries}` : ''}
[END USER PROFILE]

`;

    console.log('[Coach] Nutrition context length:', nutritionContext.length);
    console.log('[Coach] User profile context:', userProfileContext);

    // Filter out system trigger messages
    const filteredMessages = messages.filter(
      (m: { role: string; content: string }) => !m.content.startsWith(TRIGGER_PREFIX)
    );

    const totalMessageCount = filteredMessages.length;

    // === CONVERSATION MEMORY OPTIMIZATION ===
    // If we have > 10 messages, use summary + last 10 instead of full history
    let messagesToSend: { role: string; content: string }[];
    let summaryPrefix = '';

    if (totalMessageCount > RECENT_MESSAGES_TO_KEEP && existingSummary) {
      // Use summary + recent messages
      messagesToSend = filteredMessages.slice(-RECENT_MESSAGES_TO_KEEP);
      summaryPrefix = `[CONVERSATION MEMORY - Key facts from earlier:\n${existingSummary}]\n\n`;
      console.log(`[Coach] Using summary + last ${RECENT_MESSAGES_TO_KEEP} messages (total: ${totalMessageCount})`);
    } else {
      // Use full history (small conversation)
      messagesToSend = filteredMessages;
    }

    const mappedMessages = messagesToSend.map((m: { role: string; content: string }, index: number) => ({
      role: m.role as 'user' | 'assistant',
      // Prepend summary + user profile + nutrition context to the first user message
      content: index === 0 && m.role === 'user'
        ? summaryPrefix + userProfileContext + nutritionContext + m.content
        : m.content,
    }));

    // Fix message ordering if needed - if first message is assistant, prepend synthetic user
    if (mappedMessages.length > 0 && mappedMessages[0].role === 'assistant') {
      anthropicMessages = [
        { role: 'user' as const, content: summaryPrefix + userProfileContext + nutritionContext + '[User opened the coach tab]' },
        ...mappedMessages,
      ];
    } else {
      anthropicMessages = mappedMessages;
    }

    // === CHECK IF WE NEED TO UPDATE SUMMARY ===
    // Trigger summarization every SUMMARY_TRIGGER_INTERVAL messages
    const shouldSummarize = totalMessageCount >= RECENT_MESSAGES_TO_KEEP &&
      (totalMessageCount - lastSummaryCount) >= SUMMARY_TRIGGER_INTERVAL;

    if (shouldSummarize) {
      // Run summarization asynchronously (don't block the response)
      const anthropicForSummary = new Anthropic();
      generateConversationSummary(anthropicForSummary, filteredMessages, existingSummary)
        .then(async (newSummary) => {
          if (newSummary) {
            // Upsert conversation summary
            const { data: existing } = await supabase
              .from('coach_memory')
              .select('id')
              .eq('user_id', user.id)
              .eq('key', 'conversation_summary')
              .single();

            if (existing) {
              await supabase.from('coach_memory').update({ value: newSummary }).eq('id', existing.id);
            } else {
              await supabase.from('coach_memory').insert({ user_id: user.id, key: 'conversation_summary', value: newSummary });
            }

            // Update message count
            const { data: countExisting } = await supabase
              .from('coach_memory')
              .select('id')
              .eq('user_id', user.id)
              .eq('key', 'summary_message_count')
              .single();

            if (countExisting) {
              await supabase.from('coach_memory').update({ value: String(totalMessageCount) }).eq('id', countExisting.id);
            } else {
              await supabase.from('coach_memory').insert({ user_id: user.id, key: 'summary_message_count', value: String(totalMessageCount) });
            }

            console.log(`[Coach] Conversation summary updated at message ${totalMessageCount}`);
          }
        })
        .catch(err => console.error('[Coach] Async summary failed:', err));
    }
  }

  // Tool execution helper — wrapped in try/catch so a single tool failure doesn't kill the whole request
  async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
    try {
    switch (name) {
      case 'getUserProfile': {
        const { data, error } = await supabase
          .from('profiles')
          .select('height_inches, weight_lbs, goal, coaching_mode, coaching_intensity, onboarding_complete, app_tour_shown, beta_welcome_shown, created_at')
          .eq('id', user.id)
          .single();
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify(data);
      }
      case 'updateUserProfile': {
        console.log('[Coach] updateUserProfile called with input:', JSON.stringify(input));
        console.log('[Coach] User ID:', user.id);

        const updateData: Record<string, unknown> = {};
        if (input.height_inches !== undefined) updateData.height_inches = input.height_inches;
        if (input.weight_lbs !== undefined) updateData.weight_lbs = input.weight_lbs;
        if (input.goal !== undefined) updateData.goal = input.goal;
        if (input.coaching_mode !== undefined) updateData.coaching_mode = input.coaching_mode;
        if (input.coaching_intensity !== undefined) updateData.coaching_intensity = input.coaching_intensity;
        if (input.onboarding_complete !== undefined) updateData.onboarding_complete = input.onboarding_complete;
        if (input.app_tour_shown !== undefined) updateData.app_tour_shown = input.app_tour_shown;
        if (input.beta_welcome_shown !== undefined) updateData.beta_welcome_shown = input.beta_welcome_shown;

        console.log('[Coach] updateUserProfile updateData:', JSON.stringify(updateData));

        if (Object.keys(updateData).length === 0) {
          console.log('[Coach] updateUserProfile: No data to update');
          return JSON.stringify({ error: 'No data to update' });
        }

        // Use service role client to bypass RLS for profile updates
        // Use upsert to handle case where profile row doesn't exist yet
        const adminClient = getSupabaseAdmin();
        const { data, error } = await adminClient
          .from('profiles')
          .upsert({ id: user.id, ...updateData }, { onConflict: 'id' })
          .select();

        console.log('[Coach] updateUserProfile result - data:', JSON.stringify(data), 'error:', error?.message);

        if (error) {
          console.error('[Coach] updateUserProfile error:', error);
          return JSON.stringify({ error: error.message });
        }
        return JSON.stringify({ success: true, updated: updateData });
      }
      case 'getMaxes': {
        const { data, error } = await supabase
          .from('maxes')
          .select('squat, bench, deadlift, overhead, updated_at')
          .eq('user_id', user.id)
          .single();
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify(data);
      }
      case 'getRecentLifts': {
        const limit = (input.limit as number) ?? 5;
        console.log(`[Coach] getRecentLifts called for user ${user.id}, limit=${limit}`);

        // Fetch workouts
        const { data: workouts, error } = await supabase
          .from('workouts')
          .select('id, date, notes')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .limit(limit);

        if (error) {
          console.error('[Coach] getRecentLifts error:', error);
          return JSON.stringify({ error: error.message });
        }

        if (!workouts || workouts.length === 0) {
          return JSON.stringify([]);
        }

        // Fetch exercises and sets for each workout
        const workoutIds = workouts.map((w) => w.id);
        console.log('[Coach] Fetching exercises for workout IDs:', workoutIds);
        const { data: exercises, error: exError } = await supabase
          .from('exercises')
          .select('id, workout_id, name, order_index')
          .in('workout_id', workoutIds)
          .order('order_index', { ascending: true });

        if (exError) {
          console.error('[Coach] Exercises query error:', exError);
        }
        console.log(`[Coach] Exercises query returned: ${exercises?.length ?? 0} exercises`, JSON.stringify(exercises));

        const exerciseIds = (exercises || []).map((e) => e.id);
        const { data: sets, error: setsError } = exerciseIds.length > 0
          ? await supabase
              .from('sets')
              .select('id, exercise_id, weight, reps, variant, order_index')
              .in('exercise_id', exerciseIds)
              .order('order_index', { ascending: true })
          : { data: [], error: null };

        if (setsError) {
          console.error('[Coach] Sets query error:', setsError);
        }
        console.log(`[Coach] Sets query returned: ${sets?.length ?? 0} sets`);

        // Assemble the data - include variant for set type awareness
        const result = workouts.map((workout) => ({
          ...workout,
          exercises: (exercises || [])
            .filter((e) => e.workout_id === workout.id)
            .map((exercise) => ({
              name: exercise.name,
              sets: (sets || [])
                .filter((s) => s.exercise_id === exercise.id)
                .map((s) => ({ weight: s.weight, reps: s.reps, variant: s.variant || 'normal' })),
            })),
        }));

        console.log(`[Coach] getRecentLifts returned ${result.length} workouts`);
        if (result.length > 0) {
          console.log('[Coach] First workout:', JSON.stringify(result[0], null, 2));
        }
        return JSON.stringify(result);
      }
      case 'getCurrentWorkout': {
        if (!currentWorkout) return JSON.stringify({ active: false, message: 'No workout in progress' });
        return JSON.stringify({ active: true, workout: currentWorkout });
      }
      case 'getMemories': {
        const { data, error } = await supabase
          .from('coach_memory')
          .select('key, value, updated_at')
          .eq('user_id', user.id)
          .order('key', { ascending: true });
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify(data || []);
      }
      case 'saveMemory': {
        const key = input.key as string;
        const value = input.value as string;

        // Upsert: check if key exists, then update or insert
        const { data: existing } = await supabase
          .from('coach_memory')
          .select('id')
          .eq('user_id', user.id)
          .eq('key', key)
          .single();

        if (existing) {
          const { error } = await supabase
            .from('coach_memory')
            .update({ value })
            .eq('id', existing.id);
          if (error) return JSON.stringify({ error: error.message });
          return JSON.stringify({ success: true, action: 'updated', key, value });
        } else {
          const { error } = await supabase
            .from('coach_memory')
            .insert({ user_id: user.id, key, value });
          if (error) return JSON.stringify({ error: error.message });
          return JSON.stringify({ success: true, action: 'created', key, value });
        }
      }
      case 'getTodaysMeals': {
        // Use explicit date param, then client's localDate, then server fallback
        const targetDate = (input.date as string) || localDate || formatLocalDate(new Date());
        console.log('[Coach] getTodaysMeals - targetDate:', targetDate, 'localDate:', localDate);
        const { data, error } = await supabase
          .from('meals')
          .select('*')
          .eq('user_id', user.id)
          .eq('date', targetDate)
          .eq('consumed', true)
          .order('meal_type');
        if (error) return JSON.stringify({ error: error.message });
        console.log('[Coach] getTodaysMeals - found', data?.length || 0, 'consumed meals');
        return JSON.stringify(data || []);
      }
      case 'getNutritionGoals': {
        const { data, error } = await supabase
          .from('nutrition_goals')
          .select('*')
          .eq('user_id', user.id)
          .single();
        if (error) {
          // Return defaults if no goals set
          return JSON.stringify(DEFAULT_NUTRITION_GOALS);
        }
        return JSON.stringify(data);
      }
      case 'logMeal': {
        // Use explicit date param, then client's localDate, then server fallback
        const targetDate = (input.date as string) || localDate || formatLocalDate(new Date());
        const { error } = await supabase
          .from('meals')
          .insert({
            user_id: user.id,
            date: targetDate,
            meal_type: input.meal_type as string,
            food_name: input.food_name as string,
            calories: input.calories as number,
            protein: input.protein as number,
            carbs: input.carbs as number,
            fat: input.fat as number,
            serving_size: input.serving_size as string | null,
            ai_generated: false,
            consumed: true,
          });
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ success: true, message: `Logged ${input.food_name} (${input.calories} cal, ${input.protein}g protein)` });
      }
      case 'addMealPlan': {
        // Use explicit date param, then client's localDate, then server fallback
        const targetDate = (input.date as string) || localDate || formatLocalDate(new Date());
        const { error } = await supabase
          .from('meals')
          .insert({
            user_id: user.id,
            date: targetDate,
            meal_type: input.meal_type as string,
            food_name: input.food_name as string,
            calories: input.calories as number,
            protein: input.protein as number,
            carbs: input.carbs as number,
            fat: input.fat as number,
            serving_size: input.serving_size as string | null,
            ai_generated: true,
            consumed: false,
          });
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ success: true, message: `Added ${input.food_name} as pending — user can review in Nutrition tab or confirm via chat` });
      }
      case 'updateMeal': {
        const targetDate = (input.date as string) || localDate || formatLocalDate(new Date());
        const updates: Record<string, unknown> = {};
        if (input.new_food_name) updates.food_name = input.new_food_name;
        if (input.calories !== undefined) updates.calories = input.calories;
        if (input.protein !== undefined) updates.protein = input.protein;
        if (input.carbs !== undefined) updates.carbs = input.carbs;
        if (input.fat !== undefined) updates.fat = input.fat;

        if (Object.keys(updates).length === 0) {
          return JSON.stringify({ error: 'No updates provided' });
        }

        const { error } = await supabase
          .from('meals')
          .update(updates)
          .eq('user_id', user.id)
          .eq('date', targetDate)
          .eq('food_name', input.food_name as string)
          .eq('consumed', false);
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ success: true, message: `Updated ${input.food_name}` });
      }
      case 'confirmMeal': {
        const targetDate = (input.date as string) || localDate || formatLocalDate(new Date());
        const { data, error } = await supabase
          .from('meals')
          .update({ consumed: true })
          .eq('user_id', user.id)
          .eq('date', targetDate)
          .eq('food_name', input.food_name as string)
          .eq('consumed', false)
          .select();
        if (error) return JSON.stringify({ error: error.message });
        if (!data || data.length === 0) {
          return JSON.stringify({ error: `Could not find pending meal "${input.food_name}" for ${targetDate}` });
        }
        const meal = data[0];
        return JSON.stringify({ success: true, message: `Logged ${meal.food_name} (${meal.calories} cal, ${meal.protein}g protein)` });
      }
      case 'updateNutritionGoals': {
        const updates: Record<string, unknown> = {};
        if (input.calories !== undefined) updates.calories = input.calories;
        if (input.protein !== undefined) updates.protein = input.protein;
        if (input.carbs !== undefined) updates.carbs = input.carbs;
        if (input.fat !== undefined) updates.fat = input.fat;

        // Check if goals exist
        const { data: existing } = await supabase
          .from('nutrition_goals')
          .select('id')
          .eq('user_id', user.id)
          .single();

        if (existing) {
          const { error } = await supabase
            .from('nutrition_goals')
            .update(updates)
            .eq('user_id', user.id);
          if (error) return JSON.stringify({ error: error.message });
        } else {
          const { error } = await supabase
            .from('nutrition_goals')
            .insert({ user_id: user.id, ...updates });
          if (error) return JSON.stringify({ error: error.message });
        }
        return JSON.stringify({ success: true, updated: updates });
      }
      case 'save_food_staples': {
        const action = input.action as 'add' | 'remove' | 'replace';
        const items = (input.items as string[]) || [];

        // Fetch current food staples
        const { data: existingRow } = await supabase
          .from('coach_memory')
          .select('id, value')
          .eq('user_id', user.id)
          .eq('key', 'food_staples')
          .single();

        let currentStaples: string[] = [];
        if (existingRow?.value) {
          try {
            currentStaples = JSON.parse(existingRow.value);
          } catch {
            currentStaples = [];
          }
        }

        let newStaples: string[];
        if (action === 'replace') {
          newStaples = items;
        } else if (action === 'remove') {
          // Case-insensitive removal
          const lowerItems = items.map(i => i.toLowerCase());
          newStaples = currentStaples.filter(s => !lowerItems.includes(s.toLowerCase()));
        } else {
          // action === 'add' - merge and deduplicate (case-insensitive)
          const lowerExisting = currentStaples.map(s => s.toLowerCase());
          const toAdd = items.filter(i => !lowerExisting.includes(i.toLowerCase()));
          newStaples = [...currentStaples, ...toAdd];
        }

        // Upsert the food_staples row
        const newValue = JSON.stringify(newStaples);
        if (existingRow) {
          const { error } = await supabase
            .from('coach_memory')
            .update({ value: newValue })
            .eq('id', existingRow.id);
          if (error) return JSON.stringify({ error: error.message });
        } else {
          const { error } = await supabase
            .from('coach_memory')
            .insert({ user_id: user.id, key: 'food_staples', value: newValue });
          if (error) return JSON.stringify({ error: error.message });
        }

        return JSON.stringify({ success: true, action, items, staples: newStaples });
      }
      default:
        return JSON.stringify({ error: 'Unknown tool' });
    }
    } catch (err) {
      console.error(`[Coach] Tool "${name}" threw an error:`, err);
      return JSON.stringify({ error: `Tool ${name} failed: ${err instanceof Error ? err.message : 'unknown error'}` });
    }
  }

  // Create streaming response
  console.log('[Coach] Creating streaming response...');
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      console.log('[Coach] Stream started');
      try {
        const currentMessages = [...anthropicMessages];
        let textStreamed = false;

        // Log tools being sent to API
        console.log('[Coach] Tools passed to API:', tools.map(t => t.name).join(', '));
        console.log('[Coach] System prompt length:', dynamicSystemPrompt.length, 'chars');

        // Custom error for overloaded API
        class APIOverloadedError extends Error {
          constructor() {
            super('API overloaded');
            this.name = 'APIOverloadedError';
          }
        }

        // Helper to call Anthropic with retry for transient errors
        async function callAnthropicWithRetry(retries = 2): Promise<Anthropic.Message> {
          for (let attempt = 1; attempt <= retries; attempt++) {
            try {
              console.log(`[Coach] API call attempt ${attempt}/${retries}`);
              return await anthropic.messages.create({
                model: AI_MODELS.COACHING,
                max_tokens: AI_TOKEN_LIMITS.COACHING,
                system: dynamicSystemPrompt,
                messages: currentMessages,
                tools,
              });
            } catch (err) {
              const status = err instanceof Error && 'status' in err
                ? (err as { status: number }).status
                : 0;

              if (status === 529) {
                console.log(`[Coach] API overloaded (attempt ${attempt}/${retries})`);
                if (attempt < retries) {
                  await new Promise(r => setTimeout(r, 1000 * attempt));
                  continue;
                }
                throw new APIOverloadedError();
              }
              throw err;
            }
          }
          throw new Error('Max retries exceeded');
        }

        // Loop to handle tool calls (max iterations to prevent infinite loops)
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          console.log('[Coach] API call round:', round + 1);

          const response = await callAnthropicWithRetry();

          console.log('[Coach] Response stop_reason:', response.stop_reason);
          console.log('[Coach] Response content types:', response.content.map(b => b.type).join(', '));

          // Check if we need to handle tool use
          if (response.stop_reason === 'tool_use') {
            console.log('[Coach] Tool use detected!');
            const assistantContent = response.content;

            // Add assistant message with tool use
            currentMessages.push({
              role: 'assistant',
              content: assistantContent,
            });

            // Process each tool use and collect results
            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            const toolErrors: string[] = [];
            for (const block of assistantContent) {
              if (block.type === 'tool_use') {
                console.log('[Coach] Executing tool:', block.name, 'with input:', JSON.stringify(block.input));
                const result = await executeTool(block.name, block.input as Record<string, unknown>);
                console.log('[Coach] Tool result:', result.substring(0, 200));
                // Track errors for debugging
                if (result.includes('"error"')) {
                  toolErrors.push(`${block.name}: ${result}`);
                }
                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: result,
                });
              }
            }
            // Log tool errors for debugging
            if (toolErrors.length > 0) {
              console.error('[Coach] Tool errors:', toolErrors);
            }

            // Add tool results
            currentMessages.push({
              role: 'user',
              content: toolResults,
            });

            // Continue the loop to get the final response
            continue;
          }

          // Extract and stream text content
          for (const block of response.content) {
            if (block.type === 'text' && block.text.trim()) {
              const formatted = `0:${JSON.stringify(block.text)}\n`;
              controller.enqueue(encoder.encode(formatted));
              textStreamed = true;
            }
          }

          break;
        }

        // If no text was ever streamed, log and send error
        if (!textStreamed) {
          console.error('[Coach] No text content generated after', MAX_TOOL_ROUNDS, 'rounds. Messages:', currentMessages.length);
          const errorMsg = `0:${JSON.stringify("Coach hit an error — try again.")}\n`;
          controller.enqueue(encoder.encode(errorMsg));
        }

        // Mark milestones as celebrated after successful response
        if (textStreamed && milestoneContext && milestoneContext.newMilestones.length > 0) {
          console.log('[Coach] Marking milestones as celebrated:', milestoneContext.newMilestones.map(m => m.type));
          await markMilestonesCelebrated(supabase, user.id, milestoneContext.newMilestones);
        }

        controller.close();
      } catch (error) {
        // Log detailed error for debugging
        const errorDetails = error instanceof Error
          ? { message: error.message, name: error.name, stack: error.stack?.split('\n').slice(0, 3).join(' ') }
          : { raw: String(error) };
        console.error('Chat API error:', JSON.stringify(errorDetails));

        // Friendly message for overloaded API
        const isOverloaded = error instanceof Error && error.name === 'APIOverloadedError';
        const userMessage = isOverloaded
          ? "coach is busy right now — try again in a minute."
          : "coach hit an error — try again.";

        const errorMsg = `0:${JSON.stringify(userMessage)}\n`;
        controller.enqueue(encoder.encode(errorMsg));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    },
  });
}
