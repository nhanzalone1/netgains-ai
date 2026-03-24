import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { detectMilestones, markMilestonesCelebrated, formatMilestone, MilestoneContext } from '@/lib/milestones';
import { formatLocalDate } from '@/lib/date-utils';
import {
  AI_MODELS,
  AI_TOKEN_LIMITS,
  RATE_LIMITS,
  DEFAULT_NUTRITION_GOALS,
  SUBSCRIPTION_TIERS,
  DAILY_MESSAGE_LIMITS,
  SONNET_RATIO,
  SubscriptionTier,
} from '@/lib/constants';
import { retrieveRelevantMemories, RetrievedMemory } from '@/lib/memory-retrieval';
import type { Profile, NutritionGoals } from '@/lib/supabase/types';
import { isGymSpecificEquipment } from '@/lib/supabase/types';
import {
  checkRateLimit,
  rateLimitResponse,
  getClientIP,
  RATE_LIMITS as API_RATE_LIMITS,
} from '@/lib/rate-limit';

// Maximum message length (2000 characters)
const MAX_MESSAGE_LENGTH = 2000;

// Helper to get service role client for bypassing RLS (used for profile updates)
function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Normalize goal values to handle variations (cut → cutting, bulk → bulking, etc.)
function normalizeGoal(goal: string | null | undefined): string | null {
  if (!goal) return null;
  const normalized = goal.toLowerCase().trim();
  if (normalized === 'cut' || normalized === 'cutting') return 'cutting';
  if (normalized === 'bulk' || normalized === 'bulking') return 'bulking';
  if (normalized === 'maintain' || normalized === 'maintaining' || normalized === 'maintenance') return 'maintaining';
  return goal; // Return original if not recognized
}

// Check if goal is a valid value for the profile
function isValidGoal(goal: string | null | undefined): boolean {
  if (!goal) return false;
  const normalized = normalizeGoal(goal);
  return normalized === 'cutting' || normalized === 'bulking' || normalized === 'maintaining';
}

export const maxDuration = 60;

// Dynamic system prompt - includes profile collection guidance when profile is incomplete
function getSystemPrompt(profileComplete: boolean): string {
  const basePrompt = `You are Coach, an elite fitness trainer for NetGains AI. You are not a chatbot. You are not an assistant. You are the user's personal trainer who is locked in with them every single day — you know their numbers, their goals, their body, and their history.

VOICE AND STYLE:
You are a trainer who was in the room watching them execute. Direct, personal, action-oriented.

- Use their exact numbers and body stats. Not "you're in a deficit" — "you're running a 400-calorie deficit on a 174 lb frame."
- Give exact gram targets when recommending foods, never vague suggestions.
- Capitalize the first word of every sentence and paragraph. Never start a sentence with a lowercase letter.

ACTION FIRST, SCIENCE SECOND:
Lead with what to do, not why. 80% of responses should be actionable instructions, 20% should be explanation. Save biological mechanisms for when the user asks why or when context truly demands it.

RESPONSE LENGTH MATCHING:
Match your response length to the user's message energy. Short message = short answer. If they send 5 words, respond in 2-3 sentences max. If they ask a detailed question, give a detailed answer. Never write 5 paragraphs in response to a one-line message. Quick logging = quick acknowledgment. Detailed question = detailed response.

FORMATTING (CRITICAL):
Structure responses with SHORT PARAGRAPHS separated by blank lines. Each paragraph should be 1-3 sentences max.

NEVER use:
- Bullet point lists
- Numbered lists
- Walls of text without breaks
- Long dense paragraphs

ALWAYS use:
- Short punchy paragraphs
- Blank lines between sections
- ONE BLANK LINE before any bold text or section header — this separates the punchy opener from the detailed sections that follow
- Every bold section header must be on its own line. Never start a bold header inline with other text.
- Breathing room so it's easy to read on mobile

Example of BAD formatting:
"Great workout today. You hit 225 on bench which is a 10lb PR. Your protein is at 120g so far which means you need about 50g more before bed. I'd suggest having some Greek yogurt or a protein shake. Tomorrow is pull day so make sure you're recovered."

Example of GOOD formatting:
"225 on bench. That's a 10lb PR — your chest is responding to the volume increase.

**The Fuel Math**

Protein is at 120g. You need 50g more before bed. Greek yogurt or a shake, your call.

**Tomorrow**

Pull day. Get the protein in tonight and your back will be ready to go."

BOUNDARIES: Primarily fitness/nutrition. You can also help the app creator (Noah) with writing, marketing copy, app descriptions, or other requests if asked.

COACHING BOUNDARIES (CRITICAL):
Firm coaching means direct, honest, and holding the user accountable. It does NOT mean:
- Insulting the user's body ("stay fat", "you look like...")
- Cursing at them or using aggressive language
- Shaming or belittling ("stop being lazy", "pathetic")
- Tough love that crosses into cruelty
- Making the user feel bad about themselves

GOOD firm coaching examples:
- "You're 200 under target today. That's too low even for an aggressive cut — you'll lose muscle. Eat something with protein before bed."
- "3 days since your last workout. What's going on?"
- "You're 400 over on calories. That's gonna slow the cut down."

BAD coaching (NEVER do this):
- "Stop being lazy and eat or stay fat"
- "This is pathetic"
- Any insult, curse, or shame-based motivation

Be direct. Be honest. Hold them accountable. But always with respect.

KEY MEMORIES USAGE:
You have the user's key preferences in their profile under KEY MEMORIES. ALWAYS reference these. Never ask for information that is already in key_memories. If their preferred measurement is grams, NEVER default to ounces or cups. If their available food is listed, use it. If their supplement stack is listed, reference it for timing recommendations. If their injuries are listed, automatically modify exercise suggestions.

TIER-AWARE QUESTION EFFICIENCY:
Be extremely conservative with asking questions. Every message should deliver value. Never send a message that is only a question. If you must ask for clarification, combine it with useful advice in the same message.
EXAMPLE — instead of: "What do you have available to eat?"
Say: "Based on what's in your dorm, a solid option is protein powder with rice cakes and PB — about 45g protein, 400 cal. If you're heading to the dining hall instead, what's on the menu today?"

ASK BEFORE PRESCRIBE:
If you have enough context from the user's profile, key memories, and conversation history to give specific actionable advice, give it immediately. Only ask a clarifying question when genuinely missing critical information. Never ask more than one question at a time. Never ask a question you already have the answer to in key memories or profile data.

GOAL INTENSITY (check user's coaching_intensity in profile — affects calorie targets):
- "light": Small deficit/surplus (~300 cal). Slower progress, easier to sustain.
- "moderate": Standard deficit/surplus (~500 cal). Balanced approach for most users.
- "aggressive": Large deficit/surplus (~750+ cal). Faster results but harder to maintain.
When calculating or discussing calorie targets, factor in their intensity setting.

PROACTIVE MOMENTUM SYSTEM (CRITICAL):
Coach is always one step ahead. Every interaction — whether the user sends a message OR logs data — should end with a clear directive for what's next. The user should never have to ask "what do I eat now" or "what do I do next." Coach drives the day forward automatically.

MORNING WEIGHT CHECK-IN:
When the user logs their morning weight, deliver a concise day plan:
1. Quick reaction to the weight trend (1 sentence)
2. First meal — exact foods and gram targets
3. Training window if applicable
4. Post-workout meal recommendation

MEAL TYPE CLASSIFICATION (CRITICAL):
When logging food, classify correctly as "snack", a time-specific meal (breakfast/lunch/dinner), or generic "meal":

Use "snack" for small items eaten between meals:
- Protein bars (RX bars, Quest bars, KIND bars, etc.)
- Protein shakes, smoothies, pre-workout drinks
- Rice cakes, crackers, nuts
- Single fruits or small portions of vegetables
- Yogurt cups, cheese sticks
- Any quick grab-and-go item

Use "breakfast", "lunch", or "dinner" for the main meals of the day at typical times.

Use "meal" for substantial food that doesn't fit standard meal times:
- A bulker's 4th, 5th, or 6th meal of the day
- Mid-morning or mid-afternoon full meals (not snacks)
- Late night meals that are substantial (not just a snack)
- Any time the user is eating a real plated meal outside of typical breakfast/lunch/dinner windows

Rule of thumb: if it's something you'd eat standing up in 2 minutes, it's a snack. If you'd sit down with a plate or bowl, it's a meal (use the appropriate type based on timing).

AFTER LOGGING A MEAL:
Acknowledge briefly and tell them what's next:
- Confirm the meal in one line with macro summary
- Tell them what to focus on next
- End with: "next up: [X] at [time]"

AFTER LOGGING A WORKOUT:
Quick reaction to the session, then tell them exactly what to eat now:
- React to the session briefly (weights, volume if available)
- Give exact gram targets for protein and carbs for post-workout
- Preview the next meal: "next up: [X] around [time]"

AFTER AN EVENING MEAL OR END OF DAY:
- Quick status on daily targets
- If protein is short, tell them what to eat before bed
- Close the day with a one-line summary

TIME AND DAY AWARENESS:
Use the localTime and localDate from the request context. If unavailable, ask the user.

WHOLE FOODS PRIORITY:
Default to whole food sources for main meals: chicken, fish, beef, eggs, rice, oats, vegetables, fruit. Protein shakes and powders are fine when genuinely optimal — post-workout timing, hitting protein targets at end of day, or when whole food isn't practical. Don't use them as a lazy substitute for a real meal.
GOOD: "Have a shake post-workout to hit your protein window."
BAD: "Have 2 scoops of protein for lunch."

PROTEIN TARGETS DURING A CUT:
When a user is cutting, set protein target to 1g per pound of bodyweight. A 170lb user should aim for 170g, not 130g. Protein is the #1 priority during a cut to preserve muscle mass. Adjust carbs and fats around the protein target, never the other way around. As bodyweight drops, recalculate TDEE and adjust total calories down — a user at 170lbs needs fewer calories than they did at 180lbs. Recalculate every 5-10lbs of change. Note: hitting 0.85-1g/lb is still solid — this is a target, not a hard minimum.

BODYWEIGHT TRACKING INTEGRATION:
Before giving nutrition advice, check the user's recent bodyweight entries. If weight has changed significantly:
- Acknowledge it and adjust calorie/macro targets accordingly
- If weight has stalled for 10+ days on a cut: suggest dropping 100-150 calories from carbs or fats, NEVER protein
- If weight is dropping faster than 1.5lbs/week: suggest adding 100-150 calories to prevent muscle loss
Never keep macros the same if bodyweight has significantly changed.

NUTRITION MATH (CRITICAL):
Before giving any nutrition advice, use the REMAINING values from the nutrition context — they are pre-calculated for you. When discussing macros, always show the math explicitly: "you've had 72g protein so far, your target is 171g, you need 99g more." Never eyeball it. Never round aggressively. The REMAINING line in the nutrition context is your source of truth — use those exact numbers.

DAILY CARDIO AND STEP COUNT:
Proactively set a daily step count goal based on the user's activity level and goals (typically 8,000-12,000 steps for someone cutting). If the user tracks steps, check in during evening conversations. Suggest ways to add movement throughout the day. After a workout is logged, mention cardio recommendations.

CARDIO RECOMMENDATIONS (CRITICAL):
When suggesting cardio, ALWAYS use the exact parameters from the user's key_memories preferences. Include:
- Speed (e.g., 3.2 mph)
- Incline (e.g., 8-10%)
- Duration (e.g., 25 minutes)
- Heart rate zone (e.g., zone 2, 120-140 bpm)

Generic cardio suggestions are NOT acceptable. Not "do some incline walking" — "incline walk at 3.2 mph, 10% incline, 25 minutes, keep heart rate in zone 2."

If cardio preferences aren't in key_memories yet:
1. Ask once for their preferred cardio type and parameters
2. Suggest saving to key_memories: "I'll remember this so you don't have to tell me again"
3. Use saveMemory to store under the "preferences" key

For cutting: emphasize steady state cardio for fat oxidation post-lift. For bulking: keep cardio minimal (10-15 min) to preserve calories for growth.

DON'T REPEAT YOURSELF:
If you already gave advice on a topic in this conversation, don't restate it. Keep responses concise and direct. Users want actionable answers, not lectures. Reference earlier advice briefly if needed: "as I mentioned earlier..." but don't repeat the full explanation.

CALORIE FLOOR:
Soft minimums: 1500 calories for women, 1800 calories for men. If your calculation goes below these floors, warn the user once: "Heads up — this puts you at X calories which is aggressive. At this level recovery and energy can take a hit. If you're good with that and monitoring how you feel, we can run it." If user confirms, proceed and coach them at that level but check in periodically on energy, sleep, and performance. This is a bodybuilding app — users pushing hard is expected.
HARD STOP: If someone goes below 1200 (men) or 1000 (women), do not coach them at that level. Say: "That's below what I can responsibly coach. At that intake you need medical supervision. Let's either bump the calories up or get a doctor involved."

INJURY PROTOCOL:
When a user mentions pain, soreness beyond normal DOMS, or injury words (sharp pain, can't move, swollen, popping, grinding):
1. Acknowledge it seriously
2. Recommend stopping or modifying the exercise
3. Suggest seeing a professional if it persists
Example: "That sounds like it could be more than normal soreness — I'd hold off on pressing movements until you've had it checked out."
CRITICAL: Never diagnose. Never say "sounds like a rotator cuff tear" or name specific injuries. That crosses into medical advice. Keep it to: stop, modify, see a pro.

ALCOHOL AND SOCIAL EATING:
Be realistic, not preachy. Users will drink and eat out — help them plan for it. Teach calorie banking: "If you're going out tonight, keep meals lean and high protein during the day, stick to lower-calorie options like vodka soda, and get back on track tomorrow." Mention factually (not judgmentally) that alcohol impairs recovery and sleep quality. Never shame the user for drinking or eating out. One night doesn't derail a cut — a pattern does.

REST DAY RECOGNITION:
Don't just count consecutive training days — consider volume and intensity. If someone is doing heavy compounds on the same muscle groups multiple days in a row with no rest, flag it. But someone doing push/pull/legs/arms across 5-6 days with proper splits is fine.
Frame it as: "You've hit [muscle group] hard X times this week with no rest — your muscles grow during recovery, not during the lift. Consider taking tomorrow off or doing light cardio only."
Context-aware, not a blanket rule.

STRENGTH AS PROGRESS METRIC:
During a cut, if the scale stalls but lifts are going up, call that out as a win. Example: "Your scale weight hasn't moved but your incline press went from 205x8 to 205x10 — that's strength gain while cutting, which means you're likely recomping." Reference estimated 1RM data from stats when available. The scale is not the only measure of progress — strength gains, how clothes fit, and energy levels all matter. Mention these when the scale isn't moving to keep users motivated during plateaus.

FREE TIER QUALITY AND HOOKS:
Treat every user the same quality regardless of tier. Free users get the same depth and personalization as premium. On a free user's final message of the day, naturally end with a forward-looking hook — mention something specific you want to work on with them next like carb timing, a plateau strategy, or a new progression scheme. Make them want to come back. Never mention the message limit or suggest upgrading — the paywall handles that. Never break character to sell.

GENERAL RULE:
Every single response ends with what's next. Format it as:
"next up: [action] at [time] — [why it matters]"

Never leave the user at a dead end. Coach is a relay race — every baton pass tells them exactly where to run next.`;

  if (!profileComplete) {
    return basePrompt + `

NEW USER ONBOARDING:
This user is new. Focus on learning about them first. Don't suggest meal plans or discuss nutrition targets until you know their basics.

CRITICAL — SAVE USER INFO:
When the user tells you their info, you MUST save it using the correct tools:

FOR PROFILE DATA (use updateUserProfile):
- Height → updateUserProfile height_inches:[total inches, e.g., 68 for 5'8"]
- Weight → updateUserProfile weight_lbs:[number]
- Goal → updateUserProfile goal:"cutting" or "bulking" or "maintaining"

FOR MEMORY DATA (use saveMemory):
- Name → saveMemory key:"name" value:"[their name]"
- Age → saveMemory key:"age" value:"[their age]"
- Sex → saveMemory key:"sex" value:"male" or "female" (for accurate BMR calculation)
- Training split → saveMemory key:"training_split" value:"[e.g., PPL, Upper/Lower]"
- Split rotation → saveMemory key:"split_rotation" value:'["Push","Pull","Legs","Rest"]'
- Injuries → saveMemory key:"injuries" value:"[description or none]"

DO NOT just acknowledge the info. Call the tools first, then respond.

Example: User says "I'm Noah, 19, 5'8, 155 lbs, male, trying to bulk, running PPL"
You MUST call BOTH updateUserProfile AND saveMemory:
- updateUserProfile height_inches:68 weight_lbs:155 goal:"bulking"
- saveMemory key:"name" value:"Noah"
- saveMemory key:"age" value:"19"
- saveMemory key:"sex" value:"male"
- saveMemory key:"training_split" value:"PPL"
- saveMemory key:"split_rotation" value:'["Push","Pull","Legs","Rest","Push","Pull","Legs"]'
THEN respond with confirmation.

Note: Sex affects BMR calculation (166 calorie difference). If user doesn't mention it, ask naturally.

SPLIT PRESETS (use these for split_rotation):
- PPL: '["Push","Pull","Legs","Rest","Push","Pull","Legs"]'
- Upper/Lower: '["Upper","Lower","Rest","Upper","Lower","Rest"]'
- Bro: '["Chest","Back","Shoulders","Arms","Legs","Rest","Rest"]'
- Full Body: '["Full Body","Rest","Full Body","Rest","Full Body","Rest"]'

After saving, respond naturally and confirm you have their info. Then ask one follow-up if needed.

If they leave stuff out, ask naturally — one follow-up at a time.`;
  }

  // Note: App tour is now handled by interactive visual tour on the client side.
  // The tour is triggered automatically when profile is complete and app_tour_shown is false.
  // The visual tour component sets app_tour_shown: true when the user completes or skips it.

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

DUPLICATE PREVENTION:
- If you already showed a meal breakdown and logged it, don't log it again when user says "log it"
- The system will automatically detect and skip duplicates logged within 2 minutes
- If the tool returns "duplicate: true", just say "already logged" — don't apologize or over-explain

SUGGESTION vs REPORTING (CRITICAL):
- If YOU SUGGEST a meal ("eat 200g chicken and 150g sweet potato") → DO NOT log it. Ask "want me to log it?" and wait for confirmation.
- If USER REPORTS what they ate ("I just had 201g chicken and 177g sweet potato") → Log it immediately, no confirmation needed.
- The difference: suggestions are hypothetical until confirmed. User-provided amounts are facts they're reporting.
- This prevents duplicates when user adjusts your suggestion to their actual portions.

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
- IMPORTANT: When user requests a specific workout (e.g., "give me an upper body workout"), generate exercises for THAT request, NOT for their scheduled rotation

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

DON'T just say "logged" and go silent. The user is here for coaching, not just tracking. Lead them.

=== WORKOUT GENERATION ===
When a user asks you to create a workout (e.g., "give me a chest workout", "45 min leg day", "quick arm pump", "build me a workout"), use the workout generation tools.

CRITICAL - EXERCISE SELECTION RULES:
- User's explicit request ALWAYS overrides their scheduled rotation. If they ask for "upper body" but their schedule says "Legs" — give them upper body.
- ONLY include exercises that target the requested muscle groups. Never mix:
  - Upper body exercises (chest, shoulders, back, arms) in a lower body workout
  - Lower body exercises (squats, lunges, leg press, deadlifts, leg curls) in an upper body workout
- Common upper body requests: "upper body", "push", "pull", "chest", "back", "shoulders", "arms"
- Common lower body requests: "lower body", "legs", "leg day", "glutes"
- If the response includes a validation_warning about mismatched exercises, regenerate with correct exercises.

STEP 1 - GATHER INFO (if not already known):
- What gym/equipment do they have access to? Check their location context or ask: "which gym are you at — main gym or home?"
- Any time constraints? "how much time do you have?"
- Any injuries to avoid? Check their memories for injury notes.

STEP 2 - GENERATE THE WORKOUT:
Call generateWorkout with:
- workout_name: Something descriptive ("45min Chest Blast", "Quick Pull Day")
- target_muscles: Array of muscle groups (use detailed groups: chest, front_delt, side_delt, rear_delt, lats, upper_back, biceps, triceps, quads, hamstrings, glutes, calves, core)
- exercises: Full exercise array with sets, target reps, and variants
- notes: Rest times, intensity guidance, technique cues
- include_suggested_weights: Set to TRUE when user asks for weights to be loaded, wants weight suggestions, or says things like "load weights", "include weights", "with progressive overload", "tell me what weight to use"
- progressive_overload_amount: Default 2.5 lbs. Increase to 5 for experienced lifters on compound movements.

WEIGHT SUGGESTIONS (when include_suggested_weights is true):
- Weights are calculated from user's historical 1RM (estimated from their best sets)
- Progressive overload adds +2.5lbs (or specified amount) to push for gains
- Warmup sets automatically get 50% of working weight
- If user has no history for an exercise, that exercise won't have suggested weights — mention which exercises they'll need to estimate
- Tell them: "weights are based on your PRs with +2.5lbs for progressive overload"

Workout structure guidelines:
- Include 1-2 warmup sets for compound lifts (bench, squat, deadlift, OHP)
- 3-4 working sets per exercise for most movements
- 4-6 exercises for a 30-45 min session, 6-8 for 60+ min
- Start with compound movements, end with isolation
- Include rest time guidance in notes

STEP 3 - SUGGEST A FOLDER:
After generating, call getSuggestedFolder with the target_muscles.
- If a good match is found, suggest it: "this looks like a chest day — want me to load it into your 'Chest/Front Delt' folder?"
- If no good match, offer options: "want me to create a 'Coach Workouts' folder for this, or pick one of your splits?"
- Show alternatives if they want to pick a different folder

STEP 4 - LOAD THE WORKOUT:
When user confirms the folder, call loadWorkoutToFolder with folder_id and folder_name (or create_coach_folder:true).
- Tell them: "workout loaded — head to the Log tab to start. just fill in your weights as you go."

EXAMPLE FLOW:
User: "give me a 45 min chest workout"
You: "main gym today? any equipment you don't have access to?"
User: "yeah main gym, full equipment"
You: [call generateWorkout with full chest workout]
You: [call getSuggestedFolder with target_muscles]
You: "45 min chest blast locked in. 6 exercises, 20 sets: flat bench (2 warmup + 4 working), incline dumbbell press (4 sets), cable flyes (3 sets), machine chest press (3 sets), dips (3 sets), push-ups (1 burnout). rest 2 min between bench sets, 60-90 sec for accessories. this looks like a chest day — load it into your 'Chest/Front Delt' folder?"
User: "yeah do it"
You: [call loadWorkoutToFolder]
You: "loaded — head to the Log tab to start."

EXAMPLE WITH WEIGHTS:
User: "give me a chest workout and load the weights"
You: [call generateWorkout with include_suggested_weights: true]
You: [call getSuggestedFolder with target_muscles]
You: "chest day locked and loaded with weights based on your PRs (+2.5lbs progressive overload). bench press: 185lbs working sets, incline db: 60lbs, cable flyes: 30lbs. [exercises without history] will need your estimate. load it into 'Chest' folder?"
User: "yes"
You: [call loadWorkoutToFolder]
You: "done — weights are pre-filled. head to Log tab and crush it."`;
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

// === EXERCISE MUSCLE GROUP VALIDATION ===
// Maps exercise name keywords to muscle groups for validation
const EXERCISE_MUSCLE_KEYWORDS: Record<string, string[]> = {
  // Chest exercises
  chest: ['bench', 'chest', 'pec', 'fly', 'flye', 'push-up', 'pushup', 'dip'],
  // Shoulder exercises
  front_delt: ['overhead press', 'ohp', 'military press', 'shoulder press', 'front raise', 'arnold'],
  side_delt: ['lateral raise', 'side raise', 'upright row'],
  rear_delt: ['rear delt', 'face pull', 'reverse fly', 'reverse flye'],
  // Back exercises
  lats: ['lat', 'pulldown', 'pull-up', 'pullup', 'chin-up', 'chinup', 'row'],
  upper_back: ['row', 'shrug', 'face pull', 'rear delt'],
  // Arm exercises
  biceps: ['bicep', 'curl', 'preacher', 'hammer'],
  triceps: ['tricep', 'pushdown', 'skull crusher', 'close grip', 'dip', 'kickback', 'extension'],
  // Leg exercises
  quads: ['squat', 'leg press', 'leg extension', 'lunge', 'quad', 'front squat', 'hack squat'],
  hamstrings: ['hamstring', 'leg curl', 'romanian deadlift', 'rdl', 'stiff leg', 'good morning'],
  glutes: ['glute', 'hip thrust', 'deadlift', 'rdl', 'romanian', 'kickback', 'bridge'],
  calves: ['calf', 'calves', 'calf raise'],
  // Core exercises
  core: ['ab', 'abs', 'crunch', 'plank', 'sit-up', 'situp', 'leg raise', 'oblique', 'core', 'russian twist'],
};

// Keywords that indicate lower body vs upper body
const LOWER_BODY_KEYWORDS = ['squat', 'leg', 'lunge', 'deadlift', 'rdl', 'hamstring', 'quad', 'glute', 'calf', 'calves', 'hip thrust'];
const UPPER_BODY_MUSCLES = ['chest', 'front_delt', 'side_delt', 'rear_delt', 'lats', 'upper_back', 'biceps', 'triceps'];
const LOWER_BODY_MUSCLES = ['quads', 'hamstrings', 'glutes', 'calves'];

// Validates that exercises match target muscles
// Returns { valid: boolean, warnings: string[], mismatches: { exercise: string, likelyMuscle: string }[] }
function validateExerciseMuscleMatch(
  exercises: Array<{ name: string }>,
  targetMuscles: string[]
): { valid: boolean; warnings: string[]; mismatches: Array<{ exercise: string; likelyMuscle: string }> } {
  const warnings: string[] = [];
  const mismatches: Array<{ exercise: string; likelyMuscle: string }> = [];

  // Determine if this is an upper body or lower body workout
  const isUpperBodyWorkout = targetMuscles.some(m => UPPER_BODY_MUSCLES.includes(m));
  const isLowerBodyWorkout = targetMuscles.some(m => LOWER_BODY_MUSCLES.includes(m));

  for (const exercise of exercises) {
    const nameLower = exercise.name.toLowerCase();

    // Check if exercise is for lower body but target is upper body (or vice versa)
    const isLowerBodyExercise = LOWER_BODY_KEYWORDS.some(keyword => nameLower.includes(keyword));

    if (isUpperBodyWorkout && !isLowerBodyWorkout && isLowerBodyExercise) {
      // Find which lower body muscle group this exercise likely targets
      let likelyMuscle = 'lower body';
      for (const [muscle, keywords] of Object.entries(EXERCISE_MUSCLE_KEYWORDS)) {
        if (LOWER_BODY_MUSCLES.includes(muscle) && keywords.some(k => nameLower.includes(k))) {
          likelyMuscle = muscle;
          break;
        }
      }
      mismatches.push({ exercise: exercise.name, likelyMuscle });
    }

    if (isLowerBodyWorkout && !isUpperBodyWorkout) {
      // Check if this is an upper body exercise in a lower body workout
      for (const muscle of UPPER_BODY_MUSCLES) {
        const keywords = EXERCISE_MUSCLE_KEYWORDS[muscle] || [];
        if (keywords.some(k => nameLower.includes(k)) && !isLowerBodyExercise) {
          mismatches.push({ exercise: exercise.name, likelyMuscle: muscle });
          break;
        }
      }
    }
  }

  if (mismatches.length > 0) {
    warnings.push(
      `Warning: ${mismatches.length} exercise(s) may not match target muscles (${targetMuscles.join(', ')}): ` +
      mismatches.map(m => `${m.exercise} → ${m.likelyMuscle}`).join(', ')
    );
  }

  return {
    valid: mismatches.length === 0,
    warnings,
    mismatches,
  };
}

// === WEIGHT SUGGESTION SYSTEM ===
// Calculate estimated 1RM using Epley formula
function calculateEst1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  if (reps > 12) reps = 12; // Formula less accurate above 12 reps
  return weight * (1 + reps / 30);
}

// Rep-to-percentage mapping for calculating working weight from 1RM
// Based on standard strength training percentages
const REP_PERCENTAGE_MAP: Record<number, number> = {
  1: 1.00,   // 100% for 1 rep
  2: 0.97,   // 97% for 2 reps
  3: 0.93,   // 93% for 3 reps
  4: 0.90,   // 90% for 4 reps
  5: 0.87,   // 87% for 5 reps
  6: 0.85,   // 85% for 6 reps
  7: 0.83,   // 83% for 7 reps
  8: 0.80,   // 80% for 8 reps
  9: 0.77,   // 77% for 9 reps
  10: 0.75,  // 75% for 10 reps
  11: 0.72,  // 72% for 11 reps
  12: 0.70,  // 70% for 12 reps
  15: 0.65,  // 65% for 15 reps
  20: 0.60,  // 60% for 20 reps
};

// Get percentage of 1RM for a given rep count
function getPercentageFor1RM(targetReps: number): number {
  if (REP_PERCENTAGE_MAP[targetReps]) return REP_PERCENTAGE_MAP[targetReps];
  // Interpolate for values not in map
  const keys = Object.keys(REP_PERCENTAGE_MAP).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < keys.length - 1; i++) {
    if (targetReps > keys[i] && targetReps < keys[i + 1]) {
      const lower = keys[i];
      const upper = keys[i + 1];
      const lowerPct = REP_PERCENTAGE_MAP[lower];
      const upperPct = REP_PERCENTAGE_MAP[upper];
      // Linear interpolation
      return lowerPct - ((targetReps - lower) / (upper - lower)) * (lowerPct - upperPct);
    }
  }
  return 0.60; // Default for very high reps
}

// Round weight to nearest 2.5 lbs (standard plate increment)
function roundToNearest2_5(weight: number): number {
  return Math.round(weight / 2.5) * 2.5;
}

// Calculate suggested weight for a target rep range
// Returns the weight in lbs, rounded to nearest 2.5
function calculateSuggestedWeight(
  est1RM: number,
  targetReps: number,
  progressiveOverload: boolean = true,
  overloadAmount: number = 2.5 // lbs to add for progressive overload
): number {
  const percentage = getPercentageFor1RM(targetReps);
  let suggestedWeight = est1RM * percentage;

  if (progressiveOverload) {
    suggestedWeight += overloadAmount;
  }

  return roundToNearest2_5(suggestedWeight);
}

// Parse target reps string to get a number (handles ranges like "8-12")
function parseTargetReps(targetRepsStr: string): number {
  // Handle ranges like "8-12" - use the middle
  if (targetRepsStr.includes('-')) {
    const [low, high] = targetRepsStr.split('-').map(s => parseInt(s.trim()));
    if (!isNaN(low) && !isNaN(high)) {
      return Math.round((low + high) / 2);
    }
  }
  // Handle single numbers
  const num = parseInt(targetRepsStr);
  if (!isNaN(num)) return num;
  // Default for text like "to failure"
  return 10;
}

// Fetch user's best sets for exercises (by name matching)
// Returns a map of exercise name (lowercase) -> { weight, reps, est1RM }
async function fetchUserBestSets(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  exerciseNames: string[]
): Promise<Map<string, { weight: number; reps: number; est1RM: number }>> {
  const bestSets = new Map<string, { weight: number; reps: number; est1RM: number }>();

  if (exerciseNames.length === 0) return bestSets;

  // Fetch all user's workouts with exercises and sets
  const { data: workouts } = await supabase
    .from('workouts')
    .select(`
      id,
      exercises (
        id,
        name,
        sets (
          weight,
          reps,
          variant
        )
      )
    `)
    .eq('user_id', userId);

  if (!workouts) return bestSets;

  // Build a map of exercise name -> best set
  const normalizedNames = exerciseNames.map(n => n.toLowerCase());

  for (const workout of workouts) {
    const exercises = (workout.exercises || []) as Array<{
      id: string;
      name: string;
      sets: Array<{ weight: number; reps: number; variant?: string }>;
    }>;

    for (const exercise of exercises) {
      const nameLower = exercise.name.toLowerCase();

      // Check if this exercise matches any we're looking for
      const matchIndex = normalizedNames.findIndex(n =>
        n === nameLower ||
        nameLower.includes(n) ||
        n.includes(nameLower)
      );

      if (matchIndex === -1) continue;

      const originalName = exerciseNames[matchIndex].toLowerCase();

      for (const set of exercise.sets || []) {
        // Skip warmup sets
        if (set.variant === 'warmup') continue;
        if (set.weight <= 0 || set.reps <= 0) continue;

        const est1RM = calculateEst1RM(set.weight, set.reps);
        const current = bestSets.get(originalName);

        if (!current || est1RM > current.est1RM) {
          bestSets.set(originalName, {
            weight: set.weight,
            reps: set.reps,
            est1RM,
          });
        }
      }
    }
  }

  return bestSets;
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
        meal_type: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack', 'meal'], description: 'Type of meal' },
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
        meal_type: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack', 'meal'], description: 'Type of meal' },
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
  {
    name: 'generateWorkout',
    description: 'Generate a complete workout with exercises and sets based on user request. Saves as a pending workout that user can load into their workout log. Use this when user asks for a workout recommendation, program, or routine (e.g., "give me a chest workout", "45 min leg day").',
    input_schema: {
      type: 'object',
      properties: {
        workout_name: { type: 'string', description: 'Name for the workout session (e.g., "45min Chest Blast", "Quick Leg Day")' },
        target_muscles: {
          type: 'array',
          items: { type: 'string' },
          description: 'Primary muscle groups targeted (e.g., ["chest", "front_delt", "triceps"]). Use detailed muscle groups: chest, front_delt, side_delt, rear_delt, lats, upper_back, biceps, triceps, quads, hamstrings, glutes, calves, core',
        },
        duration_minutes: { type: 'number', description: 'Target duration in minutes (optional)' },
        exercises: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Exercise name' },
              equipment: { type: 'string', enum: ['barbell', 'dumbbell', 'cable', 'machine', 'smith', 'bodyweight'], description: 'Equipment type' },
              sets: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    target_reps: { type: 'string', description: 'Target reps as a string (e.g., "8-12", "15", "to failure")' },
                    variant: { type: 'string', enum: ['normal', 'warmup', 'drop', 'failure'], description: 'Set type (default: normal)' },
                    measure_type: { type: 'string', enum: ['reps', 'secs'], description: 'Reps or seconds (default: reps)' },
                  },
                  required: ['target_reps'],
                },
                description: 'Array of sets for this exercise',
              },
              notes: { type: 'string', description: 'Optional coaching notes for this exercise (form cues, tempo, etc.)' },
            },
            required: ['name', 'equipment', 'sets'],
          },
          description: 'Array of exercises in the workout',
        },
        notes: { type: 'string', description: 'Overall workout notes (rest times, intensity guidance, etc.)' },
        include_suggested_weights: {
          type: 'boolean',
          description: 'If true, calculate and include suggested weights based on user\'s historical 1RM data with progressive overload (+2.5lbs). Use this when user asks to "load weights" or wants weight suggestions.',
        },
        progressive_overload_amount: {
          type: 'number',
          description: 'Amount in lbs to add for progressive overload (default: 2.5). Only used if include_suggested_weights is true.',
        },
      },
      required: ['workout_name', 'target_muscles', 'exercises'],
    },
  },
  {
    name: 'getSuggestedFolder',
    description: 'Get the best matching folder/split for a workout based on target muscles. Returns suggested folder and alternatives. Call this after generateWorkout to suggest where to load the workout.',
    input_schema: {
      type: 'object',
      properties: {
        target_muscles: {
          type: 'array',
          items: { type: 'string' },
          description: 'Target muscle groups to match against user folders',
        },
      },
      required: ['target_muscles'],
    },
  },
  {
    name: 'loadWorkoutToFolder',
    description: 'Load the pending workout into a specific folder. Call this after user confirms the folder choice. This marks the workout as ready to load in the Log tab.',
    input_schema: {
      type: 'object',
      properties: {
        folder_id: { type: 'string', description: 'The folder ID to load the workout into' },
        folder_name: { type: 'string', description: 'The folder name (for display)' },
        create_coach_folder: { type: 'boolean', description: 'If true, create a new "Coach Workouts" folder instead of using folder_id' },
      },
      required: [],
    },
  },
];

// Prefix used by the client to signal a system trigger (hidden from UI)
const TRIGGER_PREFIX = '[SYSTEM_TRIGGER]';

// Rate limits from constants
const { MAX_TOOL_ROUNDS } = RATE_LIMITS;

// === SMART MODEL ROUTING ===
// Classify messages to determine if they need complex (Sonnet) or simple (Haiku) processing
function classifyMessageComplexity(message: string): 'simple' | 'complex' {
  const msgLower = message.toLowerCase().trim();
  const wordCount = msgLower.split(/\s+/).length;

  // Simple confirmations and acknowledgments → always Haiku
  const simplePatterns = [
    /^(yes|yeah|yep|yup|ok|okay|sure|got it|thanks|thank you|cool|nice|perfect|great|good|k|kk)\.?$/i,
    /^log (it|that|this)\.?$/i,
    /^(add|save|confirm) (it|that|this)\.?$/i,
    /^(sounds good|works for me|let's do it|do it)\.?$/i,
  ];

  for (const pattern of simplePatterns) {
    if (pattern.test(msgLower)) return 'simple';
  }

  // Quick data queries
  const quickQueryPatterns = [
    /^(what'?s|how much|how many).{0,20}(protein|calories|carbs|fat|macros)\??$/i,
    /^(what did i|did i).{0,20}(eat|log|have)\??$/i,
    /^(am i|how am i).{0,15}(doing|tracking)\??$/i,
  ];

  for (const pattern of quickQueryPatterns) {
    if (pattern.test(msgLower)) return 'simple';
  }

  // Complex patterns that benefit from Sonnet
  const complexPatterns = [
    /workout|exercise|training|routine|program|split/i,
    /meal plan|what should i eat|suggest|recommend/i,
    /why|how does|explain|help me understand/i,
    /review|analyze|breakdown|evaluate/i,
    /generate|create|build|design/i,
    /goal|bulk|cut|maintain|weight loss|muscle/i,
    /stall|plateau|not working|stuck/i,
    /injury|pain|hurt|sore/i,
    // Decision/advice questions
    /should i|is it okay|is it fine|is it bad|is it good|can i|would it/i,
  ];

  for (const pattern of complexPatterns) {
    if (pattern.test(msgLower)) return 'complex';
  }

  // Short messages without complex patterns → simple
  if (wordCount <= 3) return 'simple';

  // Detailed food logging → complex (needs accurate parsing)
  if (/\d+\s*(g|oz|lb|cal|gram|ounce)/i.test(msgLower)) return 'complex';

  // Food logging with specific items (e.g., "I had 2 eggs and toast", "ate chicken and rice")
  // Detect: number + food word, or eating verbs + multiple foods
  const foodWords = /egg|chicken|beef|fish|rice|bread|toast|oat|yogurt|milk|cheese|salad|vegetable|fruit|banana|apple|protein|shake|sandwich|burger|pizza|pasta|steak|salmon|tuna/i;
  const eatingVerbs = /^(i |just )?(had|ate|eaten|got|made|cooked|prepared|finished)/i;
  if (foodWords.test(msgLower) && (eatingVerbs.test(msgLower) || /\d+/.test(msgLower))) {
    return 'complex';
  }

  // Longer messages default to complex
  if (wordCount > 10) return 'complex';

  // Default to simple for cost savings
  return 'simple';
}

// Determine which model to use based on tier and message complexity
function selectModel(
  tier: SubscriptionTier,
  complexity: 'simple' | 'complex',
  isSystemTrigger: boolean,
  isAdmin: boolean = false
): { model: string; maxTokens: number } {
  // Admins always get Sonnet
  if (isAdmin) {
    return { model: AI_MODELS.COACHING, maxTokens: AI_TOKEN_LIMITS.COACHING };
  }

  // System triggers always use Sonnet (daily briefs need quality)
  if (isSystemTrigger) {
    return { model: AI_MODELS.COACHING, maxTokens: AI_TOKEN_LIMITS.COACHING };
  }

  // Simple messages always use Haiku
  if (complexity === 'simple') {
    return { model: AI_MODELS.COACHING_SIMPLE, maxTokens: AI_TOKEN_LIMITS.COACHING_SIMPLE };
  }

  // Complex messages: use Sonnet based on tier's ratio
  const sonnetRatio = SONNET_RATIO[tier];
  const useSonnet = Math.random() < sonnetRatio;

  if (useSonnet) {
    return { model: AI_MODELS.COACHING, maxTokens: AI_TOKEN_LIMITS.COACHING };
  } else {
    return { model: AI_MODELS.COACHING_SIMPLE, maxTokens: AI_TOKEN_LIMITS.COACHING_SIMPLE };
  }
}

export async function POST(req: Request) {
  console.log('[Coach] ========== CHAT API CALLED ==========');

  // Parse request body with error handling
  let messages: { role: string; content: string }[] | undefined;
  let currentWorkout: string | undefined;
  let localDate: string | undefined;
  let localTime: string | undefined;
  try {
    const body = await req.json();
    messages = body.messages;
    currentWorkout = body.currentWorkout;
    localDate = body.localDate; // Client's local date (YYYY-MM-DD) for timezone-aware queries
    localTime = body.localTime; // Client's local time (e.g., "9:15 PM") for time-aware advice
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

  // Validate message length (server-side enforcement of 2000 char limit)
  for (const msg of messages) {
    if (typeof msg.content === 'string' && msg.content.length > MAX_MESSAGE_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Message exceeds ${MAX_MESSAGE_LENGTH} characters` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // Get authenticated user
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    console.log('[Coach] Auth failed:', authError?.message);
    return new Response('Unauthorized', { status: 401 });
  }

  console.log('[Coach] User authenticated:', user.id);

  // Rate limiting: 20 requests per minute per user, 60 per IP
  const userRateLimit = checkRateLimit(`chat_user_${user.id}`, API_RATE_LIMITS.CHAT_USER);
  if (!userRateLimit.success) {
    console.log('[Coach] User rate limited:', user.id);
    return rateLimitResponse(userRateLimit);
  }

  const clientIP = getClientIP(req);
  const ipRateLimit = checkRateLimit(`chat_ip_${clientIP}`, API_RATE_LIMITS.CHAT_IP);
  if (!ipRateLimit.success) {
    console.log('[Coach] IP rate limited:', clientIP);
    return rateLimitResponse(ipRateLimit);
  }

  // Get user's subscription tier
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('tier, expires_at')
    .eq('user_id', user.id)
    .maybeSingle();

  // Determine effective tier (check expiration for paid tiers)
  let userTier: SubscriptionTier = SUBSCRIPTION_TIERS.FREE;
  if (subscription?.tier && subscription.tier !== SUBSCRIPTION_TIERS.FREE) {
    const isExpired = subscription.expires_at && new Date(subscription.expires_at) < new Date();
    if (!isExpired) {
      userTier = subscription.tier as SubscriptionTier;
    }
  }
  console.log('[Coach] User tier:', userTier);

  // Check if user is admin (for bypassing limits and model routing)
  const { data: adminCheck } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  const isAdmin = adminCheck?.is_admin === true;
  if (isAdmin) {
    console.log('[Coach] Admin user detected - bypassing message limits, using Sonnet');
  }

  // Get daily message limit for this tier
  const dailyLimit = DAILY_MESSAGE_LIMITS[userTier];

  // Check daily message limit (skip for system triggers and admins)
  const isSystemTriggerCheck = messages.length === 1 &&
    messages[0].role === 'user' &&
    messages[0].content.startsWith('[SYSTEM_TRIGGER]');

  if (!isSystemTriggerCheck && !isAdmin) {
    const today = formatLocalDate(new Date());
    const countKey = `message_count_${today}`;

    // Get current count
    const { data: countData } = await supabase
      .from('coach_memory')
      .select('value')
      .eq('user_id', user.id)
      .eq('key', countKey)
      .maybeSingle();

    const currentCount = countData ? parseInt(countData.value) : 0;

    if (currentCount >= dailyLimit) {
      // Return limit reached message with tier-appropriate messaging
      const encoder = new TextEncoder();
      let limitMessage: string;
      if (userTier === SUBSCRIPTION_TIERS.FREE) {
        limitMessage = "you've hit your 3 free messages for today. upgrade to Basic for 15 messages/day, or Premium for 50. resets at midnight.";
      } else if (userTier === SUBSCRIPTION_TIERS.BASIC) {
        limitMessage = "you've hit your 15 messages for today. upgrade to Premium for 50 messages/day, or check back at midnight.";
      } else {
        limitMessage = "you've hit your 50 messages for today — that's a lot of coaching! resets at midnight.";
      }
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

    console.log('[Coach] Message count:', currentCount + 1, '/', dailyLimit);
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
  let pendingChanges: { type: string; from?: string; to?: string; newCalories?: number; newRotation?: string[] } | null = null;

  // Smart routing model selection (set in each branch)
  let selectedModel: string = AI_MODELS.COACHING;
  let selectedMaxTokens: number = AI_TOKEN_LIMITS.COACHING;

  if (isSystemTrigger) {
    // System triggers always use Sonnet for quality daily briefs
    selectedModel = AI_MODELS.COACHING;
    selectedMaxTokens = AI_TOKEN_LIMITS.COACHING;
    console.log('[Coach] System trigger - using Sonnet');
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

    // Gather context for personalized opening (including weigh-in history for trend analysis)
    const [profileResult, memoriesResult, workoutsResult, todayMealsResult, yesterdayMealsResult, nutritionGoalsResult, weighInsResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('coach_memory').select('key, value').eq('user_id', user.id),
      supabase.from('workouts').select('id, date, notes').eq('user_id', user.id).order('date', { ascending: false }).limit(10),
      supabase.from('meals').select('*').eq('user_id', user.id).eq('date', todayStr).eq('consumed', true),
      supabase.from('meals').select('*').eq('user_id', user.id).eq('date', yesterdayStr).eq('consumed', true),
      supabase.from('nutrition_goals').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('weigh_ins').select('weight_lbs, date').eq('user_id', user.id).order('date', { ascending: false }).limit(14),
    ]);

    // Log any query errors (don't fail, use defaults)
    if (memoriesResult.error) console.error('[Coach] Memories query error:', memoriesResult.error);
    if (workoutsResult.error) console.error('[Coach] Workouts query error:', workoutsResult.error);
    if (todayMealsResult.error) console.error('[Coach] Today meals query error:', todayMealsResult.error);
    if (yesterdayMealsResult.error) console.error('[Coach] Yesterday meals query error:', yesterdayMealsResult.error);

    // Handle profile query failure - retry with admin client to bypass RLS race conditions during token refresh
    let profile = profileResult.data as Profile | null;
    if (profileResult.error || !profile) {
      console.warn('[Coach] Profile query failed or empty, retrying with admin client:', profileResult.error?.message);
      const adminClient = getSupabaseAdmin();
      const { data: adminProfile, error: adminError } = await adminClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (adminError) {
        console.error('[Coach] Admin profile query also failed:', adminError.message);
      } else if (adminProfile) {
        console.log('[Coach] Successfully retrieved profile via admin client');
        profile = adminProfile;
      }
    }
    const memories = memoriesResult.data || [];
    const recentWorkouts = workoutsResult.data || [];
    type MealData = { calories: number; protein: number; carbs: number; fat: number; food_name: string; created_at: string };
    const todayMeals = (todayMealsResult.data || []) as MealData[];
    const yesterdayMeals = (yesterdayMealsResult.data || []) as MealData[];
    const nutritionGoals = (nutritionGoalsResult.data || DEFAULT_NUTRITION_GOALS) as { calories: number; protein: number; carbs: number; fat: number };
    type WeighInData = { weight_lbs: number; date: string };
    const weighIns = (weighInsResult.data || []) as WeighInData[];
    const latestWeighIn = weighIns[0];

    // Auto-sync profile weight from latest weigh-in if different
    if (profile && latestWeighIn && latestWeighIn.weight_lbs !== profile.weight_lbs) {
      console.log('[Coach] Syncing profile weight from weigh-in:', latestWeighIn.weight_lbs, '(was:', profile.weight_lbs, ')');
      const adminClient = getSupabaseAdmin();
      await adminClient.from('profiles').update({ weight_lbs: latestWeighIn.weight_lbs }).eq('id', user.id);
      // Update local profile object for this request
      profile = { ...profile, weight_lbs: latestWeighIn.weight_lbs };
    }

    // Check if profile is complete (has height, weight, and goal)
    // Log individual field values to diagnose false negatives
    console.log('[Coach] Profile fields - height_inches:', profile?.height_inches, '(type:', typeof profile?.height_inches, '), weight_lbs:', profile?.weight_lbs, '(type:', typeof profile?.weight_lbs, '), goal:', profile?.goal);

    // Auto-fix goal variations in database (cut → cutting, etc.)
    if (profile?.goal && normalizeGoal(profile.goal) !== profile.goal) {
      const normalizedGoal = normalizeGoal(profile.goal);
      console.log('[Coach] Auto-fixing goal in database:', profile.goal, '→', normalizedGoal);
      const adminClient = getSupabaseAdmin();
      await adminClient.from('profiles').update({ goal: normalizedGoal }).eq('id', user.id);
      profile = { ...profile, goal: normalizedGoal };
    }

    // Use isValidGoal to accept variations like "cut" for "cutting"
    profileComplete = !!(profile?.height_inches && profile?.weight_lbs && isValidGoal(profile?.goal));
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

    // Get exercises for recent workouts (including equipment and gym info for PR tracking)
    let workoutDetails: { date: string; exercises: { name: string; equipment: string; gym_id: number | null; is_gym_specific: boolean; sets: { weight: number; reps: number; variant?: string }[] }[] }[] = [];
    if (recentWorkouts.length > 0) {
      const workoutIds = recentWorkouts.map(w => w.id);
      const { data: exercises } = await supabase
        .from('exercises')
        .select('id, workout_id, name, equipment, gym_id, is_gym_specific')
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
              equipment: e.equipment || 'barbell',
              gym_id: e.gym_id,
              is_gym_specific: e.is_gym_specific ?? isGymSpecificEquipment(e.equipment || 'barbell'),
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
    // PRs are now separated by: exercise name + equipment type + gym (for gym-specific equipment)
    const yesterdayPRs: { exercise: string; equipment: string; gym_id?: number | null; weight: number; reps: number; previousBest: { weight: number; reps: number } | null }[] = [];

    // Helper to create gym-aware PR key
    const getPRKey = (name: string, equipment: string, gymId?: number | null, isGymSpecific?: boolean): string => {
      const baseKey = `${name.toLowerCase()}::${equipment.toLowerCase()}`;
      if (isGymSpecific && gymId) {
        return `${baseKey}::gym_${gymId}`;
      }
      return baseKey;
    };

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
      const getYesterdayBest = (exercise: { name: string; equipment: string; gym_id: number | null; is_gym_specific: boolean; sets: { weight: number; reps: number; variant?: string }[] }) => {
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

        // Query historical exercises WITH equipment and gym info for proper PR separation
        const { data: historicalExercises } = await supabase
          .from('exercises')
          .select('id, workout_id, name, equipment, gym_id, is_gym_specific')
          .in('workout_id', historicalWorkoutIds)
          .in('name', exerciseNames);

        if (historicalExercises && historicalExercises.length > 0) {
          const historicalExerciseIds = historicalExercises.map(e => e.id);

          const { data: historicalSets } = await supabase
            .from('sets')
            .select('exercise_id, weight, reps, variant')
            .in('exercise_id', historicalExerciseIds);

          // Build historical bests per exercise+equipment+gym (excluding warmup sets from PR consideration)
          const historicalBests: Record<string, { weight: number; reps: number }> = {};

          for (const exercise of historicalExercises) {
            // Filter out warmup sets - they shouldn't count for historical bests
            const exerciseSets = (historicalSets || [])
              .filter(s => s.exercise_id === exercise.id && s.variant !== 'warmup');

            // Use gym-aware key for gym-specific equipment
            const isGymSpecific = exercise.is_gym_specific ?? isGymSpecificEquipment(exercise.equipment || 'barbell');
            const key = getPRKey(exercise.name, exercise.equipment || 'barbell', exercise.gym_id, isGymSpecific);

            for (const set of exerciseSets) {
              const current = historicalBests[key];
              // Compare by weight first, then by reps at same weight
              if (!current || set.weight > current.weight || (set.weight === current.weight && set.reps > current.reps)) {
                historicalBests[key] = { weight: set.weight, reps: set.reps };
              }
            }
          }

          // Check each of yesterday's exercises for PRs (using gym-aware keys)
          for (const exercise of yesterdayWorkout.exercises) {
            const yesterdayBest = getYesterdayBest(exercise);

            if (yesterdayBest) {
              const key = getPRKey(exercise.name, exercise.equipment, exercise.gym_id, exercise.is_gym_specific);
              const historical = historicalBests[key];
              // It's a PR if no historical data for this exercise OR yesterday beat the historical best
              if (!historical || yesterdayBest.weight > historical.weight ||
                  (yesterdayBest.weight === historical.weight && yesterdayBest.reps > historical.reps)) {
                yesterdayPRs.push({
                  exercise: exercise.name,
                  equipment: exercise.equipment,
                  gym_id: exercise.gym_id,
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
                equipment: exercise.equipment,
                gym_id: exercise.gym_id,
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
              equipment: exercise.equipment,
              gym_id: exercise.gym_id,
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

    // Fetch gym names for PR context (only if we have gym-specific PRs)
    let gymNameMap = new Map<number, string>();
    const gymSpecificPRs = yesterdayPRs.filter(pr => pr.gym_id);
    if (gymSpecificPRs.length > 0) {
      const gymIds = [...new Set(gymSpecificPRs.map(pr => pr.gym_id).filter(Boolean))];
      const { data: gyms } = await supabase
        .from('locations')
        .select('id, name')
        .in('id', gymIds);
      if (gyms) {
        gyms.forEach(g => gymNameMap.set(g.id, g.name));
      }
    }

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

    // Build bodyweight trend section for opening context
    // Calculate TDEE estimate based on goal and intensity (same logic as normal flow)
    const intensityDeficitOpening = profile?.coaching_intensity === 'light' ? 300
      : profile?.coaching_intensity === 'aggressive' ? 750
      : 500;
    const normalizedGoalOpening = normalizeGoal(profile?.goal);
    let estimatedTdeeOpening = nutritionGoals.calories;
    if (normalizedGoalOpening === 'cutting') {
      estimatedTdeeOpening = nutritionGoals.calories + intensityDeficitOpening;
    } else if (normalizedGoalOpening === 'bulking') {
      estimatedTdeeOpening = nutritionGoals.calories - intensityDeficitOpening;
    }

    // Format date for display (e.g., "Mar 22")
    const formatWeighInDateOpening = (dateStr: string) => {
      const date = new Date(dateStr + 'T00:00:00');
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    let bodyweightSection = '';
    if (weighIns.length > 0) {
      const currentWeight = weighIns[0].weight_lbs;
      const oldestWeighIn = weighIns[weighIns.length - 1];
      const weightChange = currentWeight - oldestWeighIn.weight_lbs;
      const changeDirection = weightChange > 0 ? '+' : '';

      // Format weigh-in history (most recent first)
      const weighInHistory = weighIns.map(w =>
        `- ${formatWeighInDateOpening(w.date)}: ${w.weight_lbs} lbs`
      ).join('\n');

      bodyweightSection = `
BODYWEIGHT TREND (last ${weighIns.length} weigh-ins):
${weighInHistory}
Current: ${currentWeight} lbs
${weighIns.length >= 2 ? `${weighIns.length > 7 ? '14' : weighIns.length}-day change: ${changeDirection}${weightChange.toFixed(1)} lbs` : ''}
Estimated TDEE: ~${estimatedTdeeOpening} cal | Daily target: ${nutritionGoals.calories} cal
`;
    }

    // Build context for opening generation - compact format to save tokens
    // IMPORTANT: Use profileComplete (calculated from actual data) not the database onboarding_complete field
    // Normalize goal for display (cut → cutting, etc.)
    const profileSummary = profile ? `profile_complete:${profileComplete}, goal:${normalizeGoal(profile.goal) || 'unset'}, mode:${profile.coaching_mode || 'unset'}, intensity:${profile.coaching_intensity || 'moderate'}, h:${profile.height_inches || '?'}in, w:${profile.weight_lbs || '?'}lbs` : 'No profile';

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
- Meals logged: ${todayMeals.map(m => {
  const time = new Date(m.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${time}: ${m.food_name}`;
}).join(', ')}` : 'No meals logged today'}

=== YESTERDAY'S DATA (${yesterday.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}) ===

🏆 PERSONAL RECORDS HIT YESTERDAY:
${yesterdayPRs.length > 0 ? yesterdayPRs.map(pr => {
  // Include equipment type if not barbell (the default)
  const equipmentStr = pr.equipment !== 'barbell' ? ` (${pr.equipment})` : '';
  // Include gym name for gym-specific equipment
  const gymStr = pr.gym_id && gymNameMap.has(pr.gym_id) ? ` @ ${gymNameMap.get(pr.gym_id)}` : '';
  return `- ${pr.exercise}${equipmentStr}${gymStr}: ${pr.weight}lbs x ${pr.reps} reps${pr.previousBest ? ` (previous best: ${pr.previousBest.weight}lbs x ${pr.previousBest.reps})` : ' (first time!)'}`;
}).join('\n') : 'No PRs yesterday'}

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
${bodyweightSection}
INSTRUCTIONS:
Generate a morning greeting. Talk like an elite personal trainer texting their client, not an AI.

**CRITICAL: Use correct day references**
- If "Today's Workout" has data → say "today" (e.g., "solid leg session today")
- If "Yesterday's Workout" has data but Today doesn't → say "yesterday"
- NEVER say "yesterday" when the workout is from today

**PRIORITY ORDER FOR GREETING:**

1. IF profile_complete is false:
   - Start with something like "hey i'm your coach. let's get you set up — what should i call you"
   - Do NOT include any workout/nutrition content for new users
   - STOP HERE — do not continue to other sections

2. IF there are NEW MILESTONES TO CELEBRATE (check the section above):
   - LEAD with the milestone celebration as the headline
   - Make it feel earned and natural, not like a system notification
   - Examples: "Day 1 done. Most people never start." / "New bench PR — 235. The work is paying off."
   - After celebration, continue to the format below

3-6. For all other cases (today workout, yesterday workout, PRs, rest day), follow the FORMAT below.

**FORMAT (for onboarded users only):**
Structure your response with SHORT PARAGRAPHS separated by blank lines. No bullet lists, no walls of text.

PARAGRAPH 1 - Headline (1-2 sentences)
Punchy reaction to the most important thing: weight change, PR, streak, yesterday's session, or new day energy.

PARAGRAPH 2 - Today's Training (1-2 sentences)
What muscle group, when to hit the gym based on their schedule if known.

PARAGRAPH 3 - First Meal (1-2 sentences)
What to eat first, exact gram targets for protein. Reference their food staples if available.

PARAGRAPH 4 - Closing (1 sentence + 1 question)
Direct mandate for the day. End with one specific question to engage them.

**EXAMPLE FORMAT:**
"235 on bench yesterday. that's a 10lb jump in two weeks.

back and bis today. get in there by noon while you're still riding that PR energy.

first meal: 40g protein minimum. eggs and that whey shake you keep stocked.

lock in the protein early and the rest of the day writes itself. what time are you training?"

Keep each paragraph SHORT. Breathing room between sections. Real numbers. Sound like a trainer who's locked in with their client.`;

    anthropicMessages = [{ role: 'user', content: contextPrompt }];
  } else {
    // Normal message flow
    // Use client's local date if provided, otherwise fall back to server date
    const todayStr = localDate || formatLocalDate(new Date());
    console.log('[Coach] === NUTRITION CONTEXT DEBUG ===');
    console.log('[Coach] Client localDate:', localDate);
    console.log('[Coach] Using todayStr:', todayStr);
    console.log('[Coach] Server date:', formatLocalDate(new Date()));

    // Fetch profile, today's nutrition data, conversation summary, message count, key memories, recent workouts, and weigh-in history
    const [profileResult, todayMealsResult, nutritionGoalsResult, summaryResult, messageCountResult, memoriesResult, recentWorkoutsResult, weighInsResult] = await Promise.all([
      supabase.from('profiles').select('height_inches, weight_lbs, goal, coaching_intensity, app_tour_shown, is_admin, key_memories').eq('id', user.id).maybeSingle(),
      supabase.from('meals').select('*').eq('user_id', user.id).eq('date', todayStr).eq('consumed', true),
      supabase.from('nutrition_goals').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('coach_memory').select('value').eq('user_id', user.id).eq('key', 'conversation_summary').maybeSingle(),
      supabase.from('coach_memory').select('value').eq('user_id', user.id).eq('key', 'summary_message_count').maybeSingle(),
      supabase.from('coach_memory').select('key, value').eq('user_id', user.id).in('key', ['training_split', 'split_rotation', 'split_repeating', 'name', 'injuries', 'pending_changes', 'sex']),
      supabase.from('workouts').select('date, notes, exercises(name)').eq('user_id', user.id).order('date', { ascending: false }).limit(7),
      supabase.from('weigh_ins').select('weight_lbs, date').eq('user_id', user.id).order('date', { ascending: false }).limit(14),
    ]);

    // Retrieve relevant long-term memories from Pinecone
    // Get the last user message to use as the query
    const lastUserMessage = messages.filter((m: { role: string }) => m.role === 'user').pop();
    const userMessageContent = lastUserMessage?.content || '';

    // Smart model routing based on tier and message complexity
    const messageComplexity = classifyMessageComplexity(userMessageContent);
    const modelSelection = selectModel(userTier, messageComplexity, false, isAdmin);
    selectedModel = modelSelection.model;
    selectedMaxTokens = modelSelection.maxTokens;
    console.log('[Coach] Message complexity:', messageComplexity, '| Model:', selectedModel, '| Tier:', userTier, '| Admin:', isAdmin);

    let relevantMemories: RetrievedMemory[] = [];

    if (userMessageContent) {
      try {
        relevantMemories = await retrieveRelevantMemories(user.id, userMessageContent);
        console.log('[Coach] Retrieved', relevantMemories.length, 'relevant memories');
      } catch (error) {
        console.error('[Coach] Memory retrieval failed:', error);
        // Continue without memories - graceful degradation
      }
    }

    // Check if profile is complete
    // Handle profile query failure - retry with admin client to bypass RLS race conditions during token refresh
    let profile = profileResult.data as Profile | null;
    if (profileResult.error || !profile) {
      console.warn('[Coach] Profile query failed or empty (normal flow), retrying with admin client:', profileResult.error?.message);
      const adminClient = getSupabaseAdmin();
      const { data: adminProfile, error: adminError } = await adminClient
        .from('profiles')
        .select('height_inches, weight_lbs, goal, coaching_intensity, app_tour_shown, is_admin, key_memories')
        .eq('id', user.id)
        .maybeSingle();

      if (adminError) {
        console.error('[Coach] Admin profile query also failed:', adminError.message);
      } else if (adminProfile) {
        console.log('[Coach] Successfully retrieved profile via admin client (normal flow)');
        profile = adminProfile as Profile;
      }
    }

    type WeighInData = { weight_lbs: number; date: string };
    const weighIns = (weighInsResult.data || []) as WeighInData[];
    const latestWeighIn = weighIns[0];

    // Auto-sync profile weight from latest weigh-in if different
    if (profile && latestWeighIn && latestWeighIn.weight_lbs !== profile.weight_lbs) {
      console.log('[Coach] Syncing profile weight from weigh-in:', latestWeighIn.weight_lbs, '(was:', profile.weight_lbs, ')');
      const adminClient = getSupabaseAdmin();
      await adminClient.from('profiles').update({ weight_lbs: latestWeighIn.weight_lbs }).eq('id', user.id);
      // Update local profile object for this request
      profile = { ...profile, weight_lbs: latestWeighIn.weight_lbs };
    }

    // Log individual field values to diagnose false negatives
    console.log('[Coach] Profile fields (normal flow) - height_inches:', profile?.height_inches, '(type:', typeof profile?.height_inches, '), weight_lbs:', profile?.weight_lbs, '(type:', typeof profile?.weight_lbs, '), goal:', profile?.goal);

    // Auto-fix goal variations in database (cut → cutting, etc.)
    if (profile?.goal && normalizeGoal(profile.goal) !== profile.goal) {
      const normalizedGoal = normalizeGoal(profile.goal);
      console.log('[Coach] Auto-fixing goal in database:', profile.goal, '→', normalizedGoal);
      const adminClient = getSupabaseAdmin();
      await adminClient.from('profiles').update({ goal: normalizedGoal }).eq('id', user.id);
      profile = { ...profile, goal: normalizedGoal };
    }

    // Use isValidGoal to accept variations like "cut" for "cutting"
    profileComplete = !!(profile?.height_inches && profile?.weight_lbs && isValidGoal(profile?.goal));
    dynamicSystemPrompt = getSystemPrompt(profileComplete);
    console.log('[Coach] Profile complete (normal flow):', profileComplete);

    // Log query results for debugging
    if (todayMealsResult.error) {
      console.error('[Coach] Today meals error:', todayMealsResult.error);
    } else {
      console.log('[Coach] Meals found:', todayMealsResult.data?.length || 0);
      if (todayMealsResult.data && todayMealsResult.data.length > 0) {
        const mealNames = (todayMealsResult.data as { food_name: string }[]).map(m => m.food_name).join(', ');
        console.log('[Coach] Meal names:', mealNames);
      }
    }

    type MealData = { calories: number; protein: number; carbs: number; fat: number; food_name: string; created_at: string };
    const todayMeals = (todayMealsResult.data || []) as MealData[];
    const nutritionGoals = (nutritionGoalsResult.data || DEFAULT_NUTRITION_GOALS) as { calories: number; protein: number; carbs: number; fat: number };
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

    // Helper to format meal time from created_at
    const formatMealTime = (createdAt: string) => {
      const date = new Date(createdAt);
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    };

    // Build current time context
    const timeContext = localTime
      ? `[CURRENT TIME: ${localTime}]
Use this for time-appropriate advice (meal timing, workout scheduling, sleep recommendations).

`
      : '';

    // Build key memories context from profile (HIGHEST PRIORITY - always reference these)
    // This is fetched directly from the database, not Pinecone
    const profileKeyMemories = profile?.key_memories as { supplements?: string; food_available?: string; preferences?: string; injuries?: string } | null;
    const hasKeyMemories = profileKeyMemories && (
      profileKeyMemories.supplements ||
      profileKeyMemories.food_available ||
      profileKeyMemories.preferences ||
      profileKeyMemories.injuries
    );

    const keyMemoriesContext = hasKeyMemories
      ? `[USER KEY PREFERENCES - ALWAYS REFERENCE THESE]
${profileKeyMemories.supplements ? `Supplements: ${profileKeyMemories.supplements}` : ''}
${profileKeyMemories.food_available ? `Food Available: ${profileKeyMemories.food_available}` : ''}
${profileKeyMemories.preferences ? `Preferences: ${profileKeyMemories.preferences}` : ''}
${profileKeyMemories.injuries ? `Injuries/Limitations: ${profileKeyMemories.injuries}` : ''}
[END KEY PREFERENCES]

`.replace(/\n{3,}/g, '\n')
      : '';

    // Build long-term memory context from Pinecone
    const memoryContext = relevantMemories.length > 0
      ? `[LONG-TERM MEMORIES]
These are facts you remember about this user from past conversations. Reference these naturally when relevant:
${relevantMemories.map(m => `- ${m.fact}`).join('\n')}
[END MEMORIES]

`
      : '';

    // Calculate remaining macros (pre-computed so coach doesn't have to do math)
    const remainingNutrition = {
      calories: Math.max(0, nutritionGoals.calories - todayNutrition.calories),
      protein: Math.max(0, nutritionGoals.protein - todayNutrition.protein),
      carbs: Math.max(0, nutritionGoals.carbs - todayNutrition.carbs),
      fat: Math.max(0, nutritionGoals.fat - todayNutrition.fat),
    };

    // Build nutrition context string with meal timestamps
    // Key memories come FIRST (highest priority), then time context, then Pinecone memories
    const nutritionContext = `${keyMemoriesContext}${timeContext}${memoryContext}[TODAY'S NUTRITION - SOURCE OF TRUTH - ${todayStr}]
This data is pulled from the database right now. ALWAYS use these exact numbers.
${todayMeals.length > 0
  ? `Consumed so far: ${todayNutrition.calories} cal, ${todayNutrition.protein}g protein, ${todayNutrition.carbs}g carbs, ${todayNutrition.fat}g fat
Goals: ${nutritionGoals.calories} cal, ${nutritionGoals.protein}g protein, ${nutritionGoals.carbs}g carbs, ${nutritionGoals.fat}g fat
REMAINING (use these numbers): ${remainingNutrition.calories} cal, ${remainingNutrition.protein}g protein, ${remainingNutrition.carbs}g carbs, ${remainingNutrition.fat}g fat
Meals logged today (with times):
${todayMeals.map(m => `- ${formatMealTime(m.created_at)}: ${m.food_name} (${m.calories} cal, ${m.protein}g protein)`).join('\n')}`
  : `No meals logged today. User is at 0 calories regardless of what was discussed earlier.
Goals: ${nutritionGoals.calories} cal, ${nutritionGoals.protein}g protein, ${nutritionGoals.carbs}g carbs, ${nutritionGoals.fat}g fat
REMAINING: ${nutritionGoals.calories} cal, ${nutritionGoals.protein}g protein, ${nutritionGoals.carbs}g carbs, ${nutritionGoals.fat}g fat`}
[END NUTRITION CONTEXT]

`;

    // Build bodyweight trend context (last 14 days of weigh-ins)
    // Calculate TDEE estimate based on goal and intensity
    const intensityDeficit = profile?.coaching_intensity === 'light' ? 300
      : profile?.coaching_intensity === 'aggressive' ? 750
      : 500;
    const normalizedGoal = normalizeGoal(profile?.goal);
    let estimatedTdee = nutritionGoals.calories;
    if (normalizedGoal === 'cutting') {
      estimatedTdee = nutritionGoals.calories + intensityDeficit;
    } else if (normalizedGoal === 'bulking') {
      estimatedTdee = nutritionGoals.calories - intensityDeficit;
    }

    // Format date for display (e.g., "Mar 22")
    const formatWeighInDate = (dateStr: string) => {
      const date = new Date(dateStr + 'T00:00:00');
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    let bodyweightContext = '';
    if (weighIns.length > 0) {
      const currentWeight = weighIns[0].weight_lbs;
      const oldestWeighIn = weighIns[weighIns.length - 1];
      const weightChange = currentWeight - oldestWeighIn.weight_lbs;
      const changeDirection = weightChange > 0 ? '+' : '';

      // Format weigh-in history (show all entries, most recent first)
      const weighInHistory = weighIns.map(w =>
        `- ${formatWeighInDate(w.date)}: ${w.weight_lbs} lbs`
      ).join('\n');

      bodyweightContext = `[BODYWEIGHT TREND - last ${weighIns.length} weigh-ins]
${weighInHistory}
Current: ${currentWeight} lbs
${weighIns.length >= 2 ? `${weighIns.length > 7 ? '14' : weighIns.length}-day change: ${changeDirection}${weightChange.toFixed(1)} lbs` : ''}
Estimated TDEE: ~${estimatedTdee} cal
Daily calorie target: ${nutritionGoals.calories} cal (${normalizedGoal || 'not set'})
[END BODYWEIGHT TREND]

`;
    }

    // Parse split rotation and calculate today's suggested workout
    let splitRotation: string[] = [];
    if (keyMemories.split_rotation) {
      try {
        splitRotation = JSON.parse(keyMemories.split_rotation);
      } catch {
        splitRotation = [];
      }
    }

    // Check if split cycle repeats
    const splitRepeating = keyMemories.split_repeating === 'true';

    // Parse pending changes (settings user updated that coach should acknowledge)
    if (keyMemories.pending_changes) {
      try {
        pendingChanges = JSON.parse(keyMemories.pending_changes);
      } catch {
        pendingChanges = null;
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
          const nextIndex = rotationPosition + 1;
          if (nextIndex < splitRotation.length) {
            todaysSuggestedWorkout = splitRotation[nextIndex];
          } else if (splitRepeating) {
            // Cycle repeats - wrap around to Day 1
            todaysSuggestedWorkout = splitRotation[0];
          } else {
            // Cycle doesn't repeat - rotation complete
            todaysSuggestedWorkout = 'Rotation complete (restart or choose freely)';
          }
        } else {
          todaysSuggestedWorkout = splitRotation.find(d => d.toLowerCase() !== 'rest') || splitRotation[0];
        }
      } else {
        todaysSuggestedWorkout = splitRotation[0];
      }
    }

    // Build pending changes section if user updated settings
    let pendingChangesSection = '';
    if (pendingChanges) {
      if (pendingChanges.type === 'intensity') {
        pendingChangesSection = `
[SETTINGS CHANGED - ACKNOWLEDGE THIS]
User just switched intensity from "${pendingChanges.from}" to "${pendingChanges.to}".
New calorie target: ${pendingChanges.newCalories} cal.
Briefly acknowledge this change in your response: "switched to ${pendingChanges.to} — target is now ${pendingChanges.newCalories} cal" and explain what this means for their approach.
[END SETTINGS CHANGED]
`;
      } else if (pendingChanges.type === 'split') {
        const newRotation = pendingChanges.newRotation || [];
        const repeats = pendingChanges.isRepeating !== undefined ? pendingChanges.isRepeating : splitRepeating;
        pendingChangesSection = `
[SETTINGS CHANGED - ACKNOWLEDGE THIS]
User just updated their training split rotation.
New rotation: ${newRotation.join(' → ')}${repeats ? ' (repeats after last day)' : ' (does not repeat)'}
${repeats ? 'After completing the last day, the cycle starts over at Day 1.' : 'The rotation ends after the last day.'}
Briefly acknowledge this change in your response: "got it — updated your rotation" and confirm what's scheduled next.
[END SETTINGS CHANGED]
`;
      }
    }

    // Build workout history with exercises (last 7 days)
    const workoutHistory = recentWorkouts.length > 0
      ? recentWorkouts.map(w => {
          const exercises = (w.exercises as { name: string }[] | null) || [];
          const exerciseNames = exercises.map(e => e.name).join(', ');
          const workoutType = w.notes?.replace(/^\[DEBUG\]\s*/, '').trim() || 'Workout';
          return `- ${w.date}: ${workoutType}${exerciseNames ? ` (${exerciseNames})` : ''}`;
        }).join('\n')
      : 'No recent workouts';

    // Build user profile context string with key settings
    // Normalize goal for display (cut → cutting, etc.)
    const userProfileContext = `[USER PROFILE]
Goal: ${normalizeGoal(profile?.goal) || 'not set'}
Intensity: ${profile?.coaching_intensity || 'moderate'} (${profile?.coaching_intensity === 'light' ? '~300 cal deficit/surplus' : profile?.coaching_intensity === 'aggressive' ? '~750+ cal deficit/surplus' : '~500 cal deficit/surplus'})
Sex: ${keyMemories.sex || 'not set'}
Height: ${profile?.height_inches ? `${Math.floor(profile.height_inches / 12)}'${profile.height_inches % 12}"` : 'not set'}
Weight: ${profile?.weight_lbs ? `${profile.weight_lbs} lbs` : 'not set'}
Training split: ${keyMemories.training_split || 'not set'}
Split rotation: ${splitRotation.length > 0 ? splitRotation.join(' → ') + (splitRepeating ? ' (repeats)' : '') : 'not set'}
${lastWorkoutInfo ? lastWorkoutInfo : ''}
${todaysSuggestedWorkout ? `Today's scheduled workout: ${todaysSuggestedWorkout}${todaysSuggestedWorkout.toLowerCase() === 'rest' ? ' (Rest Day)' : ''}` : ''}
${keyMemories.injuries && keyMemories.injuries !== 'none' ? `Injuries: ${keyMemories.injuries}` : ''}

Recent workouts (last 7 days):
${workoutHistory}
[END USER PROFILE]
${pendingChangesSection}
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
      // Prepend summary + user profile + bodyweight + nutrition context to the first user message
      content: index === 0 && m.role === 'user'
        ? summaryPrefix + userProfileContext + bodyweightContext + nutritionContext + m.content
        : m.content,
    }));

    // Fix message ordering if needed - if first message is assistant, prepend synthetic user
    if (mappedMessages.length > 0 && mappedMessages[0].role === 'assistant') {
      anthropicMessages = [
        { role: 'user' as const, content: summaryPrefix + userProfileContext + bodyweightContext + nutritionContext + '[User opened the coach tab]' },
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
              .maybeSingle();

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
              .maybeSingle();

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
          .maybeSingle();
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify(data || {});
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
          .maybeSingle();
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify(data || {});
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
          .maybeSingle();

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
          .maybeSingle();
        if (error || !data) {
          // Return defaults if no goals set
          return JSON.stringify(DEFAULT_NUTRITION_GOALS);
        }
        return JSON.stringify(data);
      }
      case 'logMeal': {
        // Use explicit date param, then client's localDate, then server fallback
        const targetDate = (input.date as string) || localDate || formatLocalDate(new Date());
        const foodName = input.food_name as string;
        const calories = input.calories as number;

        // Check for duplicate: same meal name logged today (prevents re-logging same meal)
        const { data: todaysMeals } = await supabase
          .from('meals')
          .select('id, food_name, calories, created_at')
          .eq('user_id', user.id)
          .eq('date', targetDate);

        // Check for duplicates: same name AND same calories (exact same meal logged twice)
        // This allows eating chicken breast twice if portions differ
        const foodNameLower = foodName.toLowerCase().trim();
        const isDuplicate = todaysMeals?.some(meal => {
          const mealNameLower = meal.food_name.toLowerCase().trim();
          const nameMatch = mealNameLower === foodNameLower ||
                           (mealNameLower.includes(foodNameLower) && foodNameLower.length > 5) ||
                           (foodNameLower.includes(mealNameLower) && mealNameLower.length > 5);
          const calorieMatch = meal.calories === calories;
          // Must match BOTH name AND calories to be a true duplicate
          return nameMatch && calorieMatch;
        });

        if (isDuplicate) {
          console.log('[Coach] Duplicate meal detected, skipping:', foodName);
          return JSON.stringify({
            success: true,
            duplicate: true,
            message: `${foodName} was already logged moments ago — skipping duplicate`
          });
        }

        const { error } = await supabase
          .from('meals')
          .insert({
            user_id: user.id,
            date: targetDate,
            meal_type: input.meal_type as string,
            food_name: foodName,
            calories: input.calories as number,
            protein: input.protein as number,
            carbs: input.carbs as number,
            fat: input.fat as number,
            serving_size: input.serving_size as string | null,
            ai_generated: false,
            consumed: true,
          });
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ success: true, message: `Logged ${foodName} (${input.calories} cal, ${input.protein}g protein)` });
      }
      case 'addMealPlan': {
        // Use explicit date param, then client's localDate, then server fallback
        const targetDate = (input.date as string) || localDate || formatLocalDate(new Date());
        const foodName = input.food_name as string;
        const calories = input.calories as number;

        // Check for duplicate: similar meal logged in the last 5 minutes
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data: recentMeals } = await supabase
          .from('meals')
          .select('id, food_name, calories, created_at')
          .eq('user_id', user.id)
          .eq('date', targetDate)
          .gte('created_at', fiveMinutesAgo);

        // Check for duplicates by name similarity OR same calories
        const foodNameLower = foodName.toLowerCase().trim();
        const isDuplicate = recentMeals?.some(meal => {
          const mealNameLower = meal.food_name.toLowerCase().trim();
          // Check if names are similar (one contains the other or exact match)
          const nameMatch = mealNameLower === foodNameLower ||
                           mealNameLower.includes(foodNameLower) ||
                           foodNameLower.includes(mealNameLower);
          // Check if calories are exactly the same (likely same meal)
          const calorieMatch = meal.calories === calories;
          return nameMatch || calorieMatch;
        });

        if (isDuplicate) {
          console.log('[Coach] Duplicate meal detected, skipping:', foodName);
          return JSON.stringify({
            success: true,
            duplicate: true,
            message: `${foodName} was already logged moments ago — skipping duplicate`
          });
        }

        const { error } = await supabase
          .from('meals')
          .insert({
            user_id: user.id,
            date: targetDate,
            meal_type: input.meal_type as string,
            food_name: foodName,
            calories: input.calories as number,
            protein: input.protein as number,
            carbs: input.carbs as number,
            fat: input.fat as number,
            serving_size: input.serving_size as string | null,
            ai_generated: true,
            consumed: false,
          });
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ success: true, message: `Added ${foodName} as pending — user can review in Nutrition tab or confirm via chat` });
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
          .maybeSingle();

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
          .maybeSingle();

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
      case 'generateWorkout': {
        const workoutName = input.workout_name as string;
        const targetMuscles = input.target_muscles as string[];
        const durationMinutes = input.duration_minutes as number | undefined;
        const exercises = input.exercises as Array<{
          name: string;
          equipment: string;
          sets: Array<{ target_reps: string; variant?: string; measure_type?: string }>;
          notes?: string;
        }>;
        const notes = input.notes as string | undefined;
        const includeSuggestedWeights = input.include_suggested_weights as boolean | undefined;
        const progressiveOverloadAmount = (input.progressive_overload_amount as number) ?? 2.5;

        // Validate that exercises match target muscles
        const validation = validateExerciseMuscleMatch(exercises, targetMuscles);
        if (!validation.valid) {
          console.warn('[Coach] Exercise-muscle mismatch detected:', validation.warnings);
          // Log mismatches for debugging but don't block - return warning in response
        }

        // Fetch user's best sets if weight suggestions are requested
        let bestSetsMap = new Map<string, { weight: number; reps: number; est1RM: number }>();
        let weightSuggestions: Array<{ exercise: string; suggestedWeight: number; basedOn1RM: number; bestSet: { weight: number; reps: number } }> = [];

        if (includeSuggestedWeights) {
          const exerciseNames = exercises.map(ex => ex.name);
          bestSetsMap = await fetchUserBestSets(supabase, user.id, exerciseNames);
          console.log('[Coach] Fetched best sets for', bestSetsMap.size, 'exercises');
        }

        // Build the pending workout structure (matches localStorage format)
        const pendingWorkout = {
          workoutName,
          targetMuscles,
          generatedAt: new Date().toISOString(),
          durationMinutes,
          notes,
          readyToLoad: false, // Will be set to true when folder is confirmed
          folderId: null as string | null,
          folderName: null as string | null,
          includesSuggestedWeights: includeSuggestedWeights || false,
          exercises: exercises.map(ex => {
            // Look up user's best set for this exercise
            const nameLower = ex.name.toLowerCase();
            const bestSetData = bestSetsMap.get(nameLower);

            return {
              name: ex.name,
              equipment: ex.equipment,
              templateId: null, // Will be matched on load if exercise exists in user's library
              sets: ex.sets.map(set => {
                let suggestedWeight = '';

                // Calculate suggested weight if we have historical data and weights are requested
                if (includeSuggestedWeights && bestSetData && set.variant !== 'warmup') {
                  const targetReps = parseTargetReps(set.target_reps);
                  const weight = calculateSuggestedWeight(
                    bestSetData.est1RM,
                    targetReps,
                    true, // progressive overload
                    progressiveOverloadAmount
                  );
                  suggestedWeight = weight.toString();

                  // Track for response summary
                  if (!weightSuggestions.find(w => w.exercise === ex.name)) {
                    weightSuggestions.push({
                      exercise: ex.name,
                      suggestedWeight: weight,
                      basedOn1RM: Math.round(bestSetData.est1RM),
                      bestSet: { weight: bestSetData.weight, reps: bestSetData.reps },
                    });
                  }
                } else if (includeSuggestedWeights && set.variant === 'warmup' && bestSetData) {
                  // Warmup sets: use 50-60% of working weight
                  const targetReps = parseTargetReps(set.target_reps);
                  const workingWeight = calculateSuggestedWeight(bestSetData.est1RM, targetReps, false, 0);
                  suggestedWeight = roundToNearest2_5(workingWeight * 0.5).toString();
                }

                return {
                  weight: suggestedWeight,
                  reps: '',
                  targetReps: set.target_reps, // Keep for display
                  variant: set.variant || 'normal',
                  measureType: set.measure_type || 'reps',
                };
              }),
              notes: ex.notes || null,
              defaultMeasureType: ex.sets[0]?.measure_type || 'reps',
            };
          }),
        };

        // Save to coach_memory as pending_workout (upsert)
        const { data: existing } = await supabase
          .from('coach_memory')
          .select('id')
          .eq('user_id', user.id)
          .eq('key', 'pending_workout')
          .maybeSingle();

        const workoutJson = JSON.stringify(pendingWorkout);

        if (existing) {
          const { error } = await supabase
            .from('coach_memory')
            .update({ value: workoutJson })
            .eq('id', existing.id);
          if (error) return JSON.stringify({ error: error.message });
        } else {
          const { error } = await supabase
            .from('coach_memory')
            .insert({ user_id: user.id, key: 'pending_workout', value: workoutJson });
          if (error) return JSON.stringify({ error: error.message });
        }

        // Build response with weight suggestions info
        const exercisesWithSuggestions = weightSuggestions.length;
        const exercisesWithoutHistory = includeSuggestedWeights
          ? exercises.filter(ex => !bestSetsMap.has(ex.name.toLowerCase())).map(ex => ex.name)
          : [];

        return JSON.stringify({
          success: true,
          message: `Workout "${workoutName}" generated and saved`,
          workout_name: workoutName,
          target_muscles: targetMuscles,
          exercise_count: exercises.length,
          total_sets: exercises.reduce((sum, ex) => sum + ex.sets.length, 0),
          // Weight suggestions info
          ...(includeSuggestedWeights && {
            weights_included: true,
            progressive_overload_amount: progressiveOverloadAmount,
            exercises_with_suggested_weights: exercisesWithSuggestions,
            weight_suggestions: weightSuggestions,
            exercises_without_history: exercisesWithoutHistory.length > 0 ? exercisesWithoutHistory : undefined,
          }),
          // Include validation warnings if exercises don't match target muscles
          ...(validation.warnings.length > 0 && {
            validation_warning: validation.warnings.join('; '),
            mismatched_exercises: validation.mismatches,
          }),
        });
      }
      case 'getSuggestedFolder': {
        const targetMuscles = input.target_muscles as string[];

        // Fetch user's folders with their locations
        const { data: folders, error: foldersError } = await supabase
          .from('folders')
          .select('id, name, location_id, locations(name)')
          .eq('user_id', user.id)
          .order('order_index');

        if (foldersError) {
          return JSON.stringify({ error: foldersError.message });
        }

        if (!folders || folders.length === 0) {
          return JSON.stringify({
            success: true,
            suggested: null,
            alternatives: [],
            message: 'No folders found. Offer to create a "Coach Workouts" folder.',
          });
        }

        // Muscle group mapping for folder name matching
        const muscleKeywords: Record<string, string[]> = {
          chest: ['chest', 'pec', 'push', 'bench'],
          front_delt: ['front delt', 'front shoulder', 'push', 'shoulder'],
          side_delt: ['side delt', 'lateral', 'shoulder'],
          rear_delt: ['rear delt', 'back', 'pull'],
          lats: ['lat', 'back', 'pull'],
          upper_back: ['upper back', 'back', 'pull', 'row'],
          biceps: ['bicep', 'arm', 'pull', 'curl'],
          triceps: ['tricep', 'arm', 'push'],
          quads: ['quad', 'leg', 'squat', 'lower'],
          hamstrings: ['hamstring', 'leg', 'lower'],
          glutes: ['glute', 'leg', 'lower', 'hip'],
          calves: ['calf', 'calves', 'leg', 'lower'],
          core: ['core', 'ab', 'abs'],
        };

        // Score each folder based on name matching
        const scoredFolders = folders.map(folder => {
          const folderNameLower = folder.name.toLowerCase();
          let score = 0;

          for (const muscle of targetMuscles) {
            const keywords = muscleKeywords[muscle] || [muscle];
            for (const keyword of keywords) {
              if (folderNameLower.includes(keyword.toLowerCase())) {
                score += 10;
              }
            }
          }

          // Bonus for exact muscle name in folder
          for (const muscle of targetMuscles) {
            const muscleName = muscle.replace('_', ' ');
            if (folderNameLower.includes(muscleName)) {
              score += 20;
            }
          }

          return {
            id: folder.id,
            name: folder.name,
            location_name: (folder.locations as { name: string } | null)?.name || 'Unknown',
            score,
          };
        });

        // Sort by score descending
        scoredFolders.sort((a, b) => b.score - a.score);

        const suggested = scoredFolders[0]?.score > 0 ? scoredFolders[0] : null;
        const alternatives = scoredFolders.slice(suggested ? 1 : 0, 5);

        return JSON.stringify({
          success: true,
          suggested,
          alternatives,
          all_folders: scoredFolders.slice(0, 10),
        });
      }
      case 'loadWorkoutToFolder': {
        const folderId = input.folder_id as string | undefined;
        const folderName = input.folder_name as string | undefined;
        const createCoachFolder = input.create_coach_folder as boolean | undefined;

        // If creating coach folder, find or create it
        let targetFolderId = folderId;
        let targetFolderName = folderName;

        if (createCoachFolder) {
          // Find user's first location (or create one if none exists)
          const { data: locations } = await supabase
            .from('locations')
            .select('id')
            .eq('user_id', user.id)
            .limit(1);

          if (!locations || locations.length === 0) {
            return JSON.stringify({ error: 'No gym/location found. Please create a gym first.' });
          }

          const locationId = locations[0].id;

          // Check if Coach Workouts folder exists
          const { data: existingFolder } = await supabase
            .from('folders')
            .select('id, name')
            .eq('user_id', user.id)
            .eq('name', 'Coach Workouts')
            .maybeSingle();

          if (existingFolder) {
            targetFolderId = existingFolder.id;
            targetFolderName = existingFolder.name;
          } else {
            // Create the folder
            const { data: newFolder, error: createError } = await supabase
              .from('folders')
              .insert({
                user_id: user.id,
                location_id: locationId,
                name: 'Coach Workouts',
                order_index: 999, // Put at end
              })
              .select('id, name')
              .single();

            if (createError) {
              return JSON.stringify({ error: `Failed to create folder: ${createError.message}` });
            }

            targetFolderId = newFolder.id;
            targetFolderName = newFolder.name;
          }
        }

        if (!targetFolderId || !targetFolderName) {
          return JSON.stringify({ error: 'folder_id and folder_name are required, or set create_coach_folder to true' });
        }

        // Fetch the pending workout
        const { data: pendingData, error: pendingError } = await supabase
          .from('coach_memory')
          .select('id, value')
          .eq('user_id', user.id)
          .eq('key', 'pending_workout')
          .maybeSingle();

        if (pendingError || !pendingData) {
          return JSON.stringify({ error: 'No pending workout found. Generate a workout first.' });
        }

        // Parse and update the pending workout
        let pendingWorkout;
        try {
          pendingWorkout = JSON.parse(pendingData.value);
        } catch {
          return JSON.stringify({ error: 'Failed to parse pending workout' });
        }

        pendingWorkout.folderId = targetFolderId;
        pendingWorkout.folderName = targetFolderName;
        pendingWorkout.readyToLoad = true;

        // Save updated pending workout
        const { error: updateError } = await supabase
          .from('coach_memory')
          .update({ value: JSON.stringify(pendingWorkout) })
          .eq('id', pendingData.id);

        if (updateError) {
          return JSON.stringify({ error: updateError.message });
        }

        return JSON.stringify({
          success: true,
          message: `Workout ready to load into "${targetFolderName}"`,
          folder_id: targetFolderId,
          folder_name: targetFolderName,
          workout_name: pendingWorkout.workoutName,
        });
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
        let fullResponseText = ''; // Accumulate full response for DB save

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
              console.log(`[Coach] API call attempt ${attempt}/${retries} with ${selectedModel}`);
              return await anthropic.messages.create({
                model: selectedModel,
                max_tokens: selectedMaxTokens,
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

            // Stream any text content that came with the tool use BEFORE processing tools
            for (const block of assistantContent) {
              if (block.type === 'text' && block.text.trim()) {
                const formatted = `0:${JSON.stringify(block.text)}\n`;
                controller.enqueue(encoder.encode(formatted));
                textStreamed = true;
                fullResponseText += block.text;
              }
            }

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
              fullResponseText += block.text; // Accumulate for DB save
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

        // Clear pending_changes after coach has acknowledged them
        if (textStreamed && pendingChanges) {
          console.log('[Coach] Clearing pending_changes after acknowledgment');
          await supabase
            .from('coach_memory')
            .delete()
            .eq('user_id', user.id)
            .eq('key', 'pending_changes');
        }

        // Save assistant message to database (enables badge when user navigates away)
        if (textStreamed && fullResponseText.trim()) {
          console.log('[Coach] Saving assistant message to DB, length:', fullResponseText.length);
          const { error: saveError } = await supabase
            .from('chat_messages')
            .insert({
              user_id: user.id,
              role: 'assistant',
              content: fullResponseText.trim(),
              hidden: false,
            });
          if (saveError) {
            console.error('[Coach] Failed to save assistant message:', saveError);
          }
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
