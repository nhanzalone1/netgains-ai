/**
 * Baechle Engine - 8-Week Periodization with HLM Daily Split
 *
 * Phase Structure:
 * - Weeks 1-4 (Strength Phase): 80% → 90% of 1RM, 3x5 rep scheme
 * - Week 5 (Unloading/Deload): 60% of 1RM, recovery volume
 * - Weeks 6-8 (Power Phase): 90% → 100%+ of 1RM, 3x3 → 3x1
 *
 * Daily HLM Split (applied every week):
 * - Monday (HEAVY): 100% of weekly target
 * - Wednesday (LIGHT): 80% of Monday's weight
 * - Friday (MEDIUM): 90% of Monday's weight
 *
 * Warmup Protocol (NSCA Standard):
 * - Set 1: Bar (45 lbs) x 10 (General activation)
 * - Set 2: 50% of Target x 5
 * - Set 3: 70% of Target x 3
 * - Set 4: 90% of Target x 1 (CNS Priming)
 */

export interface LiftMaxes {
  squat: number;
  bench: number;
  deadlift: number;
}

export interface LiftSet {
  lift: "squat" | "bench" | "deadlift";
  shortName: "SQ" | "BP" | "DL";
  weight: number;
  sets: number;
  reps: number;
}

export interface WarmupSet {
  weight: number;
  reps: number;
  label: string;
}

export interface LiftWarmup {
  lift: "squat" | "bench" | "deadlift";
  shortName: "SQ" | "BP" | "DL";
  sets: WarmupSet[];
}

export interface DaySchedule {
  dayName: string;
  shortDay: "MON" | "WED" | "FRI";
  intensity: "heavy" | "light" | "medium";
  intensityLabel: string;
  intensityPercent: number;
  lifts: LiftSet[];
  warmups: LiftWarmup[];
  completed: boolean;
}

export interface WeekSchedule {
  week: number;
  weeklyTargetPercent: number;
  phase: string;
  phaseLabel: string;
  days: DaySchedule[];
  completed: boolean;
}

/**
 * 8-Week Periodization Structure
 *
 * Weeks 1-4: Strength Phase (Linear 80% → 90%)
 * Week 5: Unloading/Deload (60%)
 * Weeks 6-8: Power Phase (90% → 100%+)
 */
const WEEKLY_TARGETS: {
  week: number;
  percent: number;
  sets: number;
  reps: number;
  phase: string;
  phaseLabel: string;
}[] = [
  // Strength Phase (Weeks 1-4): Linear progression 80% → 90%
  { week: 1, percent: 0.80, sets: 3, reps: 5, phase: "Strength", phaseLabel: "WEEK 1 - STRENGTH" },
  { week: 2, percent: 0.83, sets: 3, reps: 5, phase: "Strength", phaseLabel: "WEEK 2 - STRENGTH" },
  { week: 3, percent: 0.87, sets: 3, reps: 5, phase: "Strength", phaseLabel: "WEEK 3 - STRENGTH" },
  { week: 4, percent: 0.90, sets: 3, reps: 5, phase: "Strength", phaseLabel: "WEEK 4 - STRENGTH" },

  // Unloading/Deload (Week 5)
  { week: 5, percent: 0.60, sets: 3, reps: 5, phase: "Unloading", phaseLabel: "WEEK 5 - UNLOADING" },

  // Power Phase (Weeks 6-8): Peak intensity 90% → 100%+
  { week: 6, percent: 0.90, sets: 3, reps: 3, phase: "Power", phaseLabel: "WEEK 6 - POWER" },
  { week: 7, percent: 0.95, sets: 3, reps: 2, phase: "Power", phaseLabel: "WEEK 7 - POWER" },
  { week: 8, percent: 1.00, sets: 3, reps: 1, phase: "Power", phaseLabel: "WEEK 8 - POWER (PEAK)" },
];

/**
 * HLM Daily Multipliers (applied to weekly target)
 */
const HLM_MULTIPLIERS = {
  heavy: { multiplier: 1.0, label: "HEAVY" },
  light: { multiplier: 0.8, label: "LIGHT (80%)" },
  medium: { multiplier: 0.9, label: "MEDIUM (90%)" },
};

const BAR_WEIGHT = 45;

/**
 * Round weight to nearest 5 lbs for practical loading
 */
export function roundToNearest5(weight: number): number {
  return Math.round(weight / 5) * 5;
}

/**
 * Calculate NSCA Standard Warmup Sets
 *
 * Protocol:
 * - Set 1: Bar (45 lbs) x 10 (General activation)
 * - Set 2: 50% of Target x 5
 * - Set 3: 70% of Target x 3
 * - Set 4: 90% of Target x 1 (CNS Priming)
 *
 * Rules:
 * - All weights round to nearest 5 lbs
 * - Skip sets where calculated weight < bar weight
 */
export function calculateWarmups(
  targetWeight: number,
  lift: "squat" | "bench" | "deadlift",
  shortName: "SQ" | "BP" | "DL"
): LiftWarmup {
  const warmupProtocol = [
    { percent: 0, reps: 10, label: "Bar" },      // Empty bar
    { percent: 0.50, reps: 5, label: "50%" },    // 50% of target
    { percent: 0.70, reps: 3, label: "70%" },    // 70% of target
    { percent: 0.90, reps: 1, label: "90%" },    // 90% of target (CNS priming)
  ];

  const sets: WarmupSet[] = [];

  for (const protocol of warmupProtocol) {
    let weight: number;

    if (protocol.percent === 0) {
      // Empty bar
      weight = BAR_WEIGHT;
    } else {
      weight = roundToNearest5(targetWeight * protocol.percent);
    }

    // Skip if weight is less than bar weight (except for bar itself)
    if (weight < BAR_WEIGHT) {
      continue;
    }

    // Skip duplicate weights (e.g., if 50% rounds to same as bar)
    if (sets.length > 0 && sets[sets.length - 1].weight === weight) {
      continue;
    }

    // Skip if weight equals or exceeds target (warmup shouldn't match working weight)
    if (protocol.percent > 0 && weight >= targetWeight) {
      continue;
    }

    sets.push({
      weight,
      reps: protocol.reps,
      label: protocol.label,
    });
  }

  return { lift, shortName, sets };
}

/**
 * Format warmup sets as concise string: "45x10, 135x5, 185x3, 225x1"
 */
export function formatWarmupSets(warmup: LiftWarmup): string {
  return warmup.sets.map((s) => `${s.weight}x${s.reps}`).join(", ");
}

/**
 * Generate a single day's schedule
 */
function generateDay(
  maxes: LiftMaxes,
  weeklyTargetPercent: number,
  sets: number,
  reps: number,
  dayName: string,
  shortDay: "MON" | "WED" | "FRI",
  intensity: "heavy" | "light" | "medium"
): DaySchedule {
  const hlm = HLM_MULTIPLIERS[intensity];
  const dayPercent = weeklyTargetPercent * hlm.multiplier;

  // Calculate the percentage label for display
  const displayPercent = Math.round(weeklyTargetPercent * 100);
  const intensityLabel =
    intensity === "heavy"
      ? `HEAVY ${displayPercent}%`
      : hlm.label;

  const lifts: LiftSet[] = [
    {
      lift: "squat",
      shortName: "SQ",
      weight: roundToNearest5(maxes.squat * dayPercent),
      sets,
      reps,
    },
    {
      lift: "bench",
      shortName: "BP",
      weight: roundToNearest5(maxes.bench * dayPercent),
      sets,
      reps,
    },
    {
      lift: "deadlift",
      shortName: "DL",
      weight: roundToNearest5(maxes.deadlift * dayPercent),
      sets,
      reps,
    },
  ];

  // Generate NSCA standard warmups for each lift
  const warmups: LiftWarmup[] = lifts.map((l) =>
    calculateWarmups(l.weight, l.lift, l.shortName)
  );

  return {
    dayName,
    shortDay,
    intensity,
    intensityLabel,
    intensityPercent: dayPercent,
    lifts,
    warmups,
    completed: false,
  };
}

/**
 * Generate a single week's schedule with HLM split
 */
export function generateWeekSchedule(
  maxes: LiftMaxes,
  week: number = 1
): WeekSchedule {
  // Clamp week to 1-8
  const weekNum = Math.max(1, Math.min(8, week));
  const target = WEEKLY_TARGETS[weekNum - 1];

  const days: DaySchedule[] = [
    generateDay(
      maxes,
      target.percent,
      target.sets,
      target.reps,
      "Monday",
      "MON",
      "heavy"
    ),
    generateDay(
      maxes,
      target.percent,
      3, // Light day always 3x5 for recovery
      5,
      "Wednesday",
      "WED",
      "light"
    ),
    generateDay(
      maxes,
      target.percent,
      3, // Medium day always 3x5
      5,
      "Friday",
      "FRI",
      "medium"
    ),
  ];

  return {
    week: weekNum,
    weeklyTargetPercent: target.percent,
    phase: target.phase,
    phaseLabel: target.phaseLabel,
    days,
    completed: false,
  };
}

/**
 * Generate the full 8-week program
 */
export function generateFullProgram(maxes: LiftMaxes): WeekSchedule[] {
  return WEEKLY_TARGETS.map((_, idx) =>
    generateWeekSchedule(maxes, idx + 1)
  );
}

/**
 * Get the weekly target info for display
 */
export function getWeeklyTargets() {
  return WEEKLY_TARGETS.map((t) => ({
    week: t.week,
    percent: Math.round(t.percent * 100),
    scheme: `${t.sets}x${t.reps}`,
    phase: t.phase,
    phaseLabel: t.phaseLabel,
  }));
}

/**
 * Get phase color for UI
 */
export function getPhaseColor(phase: string): string {
  switch (phase) {
    case "Strength":
      return "text-primary";
    case "Unloading":
      return "text-success";
    case "Power":
      return "text-orange-500";
    default:
      return "text-foreground";
  }
}

/**
 * Estimate 1RM from weight and reps using Brzycki formula
 */
export function estimate1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  if (reps > 12) reps = 12; // Formula becomes less accurate above 12 reps
  return roundToNearest5(weight * (36 / (37 - reps)));
}
