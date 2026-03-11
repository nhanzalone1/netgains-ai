/**
 * Haptic feedback utilities for native-feeling interactions
 * Uses the Vibration API where available (iOS Safari, Android Chrome)
 */

type HapticPattern = "light" | "medium" | "heavy" | "success" | "error" | "warning";

const patterns: Record<HapticPattern, number | number[]> = {
  light: 10,           // Light tap - button press
  medium: 25,          // Medium tap - selection change
  heavy: 50,           // Heavy tap - important action
  success: [10, 50, 10], // Double tap - success confirmation
  error: [50, 30, 50],   // Buzz pattern - error
  warning: [30, 20, 30], // Alert pattern - warning
};

/**
 * Trigger haptic feedback
 * @param pattern - The haptic pattern to use
 */
export function haptic(pattern: HapticPattern = "light"): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(patterns[pattern]);
    } catch {
      // Silently fail if vibration not supported
    }
  }
}

/**
 * Check if haptic feedback is supported
 */
export function isHapticSupported(): boolean {
  return typeof navigator !== "undefined" && "vibrate" in navigator;
}

// Convenience exports
export const hapticLight = () => haptic("light");
export const hapticMedium = () => haptic("medium");
export const hapticHeavy = () => haptic("heavy");
export const hapticSuccess = () => haptic("success");
export const hapticError = () => haptic("error");
export const hapticWarning = () => haptic("warning");
