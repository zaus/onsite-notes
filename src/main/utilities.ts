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

/**
 * Parses `value` as a finite number from 0 to 1 inclusive.
 * Returns the number, or `null` if the value is outside the unit interval.
 */
export function toUnitIntervalNumber(value: unknown): number | null {
  const normalized = typeof value === 'string' ? value.trim() : value;
  if (normalized === '') {
    return null;
  }

  const parsed = typeof normalized === 'number' ? normalized : Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return null;
  }

  return parsed;
}
