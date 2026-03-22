/**
 * Parses `value` as a positive integer.
 * Returns the floored integer, or `null` if the value is not a positive finite number.
 */
export function toPositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return null;
}
