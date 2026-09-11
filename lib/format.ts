/** Presentation helpers shared by screens. No domain rules live here. */

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * Human-readable byte size, e.g. `1.4 GB`.
 *
 * Used for model download sizes, where the point is to let a field user judge
 * "can I do this on the hotel wifi", so one decimal place from MB upwards is
 * enough and exact byte counts would be noise. Non-finite or negative input
 * returns `0 B` rather than `NaN B`.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const decimals = unit >= 2 && value < 100 ? 1 : 0;
  return `${value.toFixed(decimals)} ${UNITS[unit]}`;
}
