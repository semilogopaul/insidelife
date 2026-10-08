import type { ValueTransformer } from 'typeorm';

/**
 * Postgres BIGINT arrives as a string from `pg`. Money and game time stay far below 2^53, so we map them to JS
 * numbers and assert safety at the boundary.
 */
export const bigintNumber: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | number | null) => {
    if (value === null || value === undefined) return value;
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(parsed)) throw new RangeError(`BIGINT out of safe range: ${value}`);
    return parsed;
  },
};

/** NUMERIC/DECIMAL also arrive as strings. */
export const decimalNumber: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | number | null) => (value === null || value === undefined ? value : Number(value)),
};
