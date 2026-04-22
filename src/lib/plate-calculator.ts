/**
 * Plate Calculator
 *
 * Calculates which plates to load on each side of the bar
 * Assumes standard 45 lb barbell
 */

const BARBELL_WEIGHT = 45;
const AVAILABLE_PLATES = [45, 35, 25, 10, 5, 2.5];

export interface PlateResult {
  totalWeight: number;
  barbellWeight: number;
  perSide: { plate: number; count: number }[];
  achievableWeight: number;
}

/**
 * Calculate plates needed per side to reach target weight
 */
export function calculatePlates(targetWeight: number): PlateResult {
  const weightPerSide = (targetWeight - BARBELL_WEIGHT) / 2;
  const perSide: { plate: number; count: number }[] = [];

  let remaining = weightPerSide;

  for (const plate of AVAILABLE_PLATES) {
    if (remaining >= plate) {
      const count = Math.floor(remaining / plate);
      perSide.push({ plate, count });
      remaining -= plate * count;
    }
  }

  const achievablePerSide = perSide.reduce(
    (sum, { plate, count }) => sum + plate * count,
    0
  );

  return {
    totalWeight: targetWeight,
    barbellWeight: BARBELL_WEIGHT,
    perSide,
    achievableWeight: BARBELL_WEIGHT + achievablePerSide * 2,
  };
}

/**
 * Format plate breakdown as readable string
 */
export function formatPlates(result: PlateResult): string {
  if (result.perSide.length === 0) {
    return "Empty bar (45 lbs)";
  }

  return result.perSide
    .map(({ plate, count }) => `${count}x${plate}`)
    .join(" + ");
}
