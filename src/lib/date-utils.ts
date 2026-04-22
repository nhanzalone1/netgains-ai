/**
 * Format a date as YYYY-MM-DD using LOCAL time (not UTC).
 * This prevents timezone issues where "today" shifts to yesterday/tomorrow.
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get today's date string in YYYY-MM-DD format using local time.
 */
export function getTodayString(): string {
  return formatLocalDate(new Date());
}
