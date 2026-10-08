import type { EntityManager } from 'typeorm';
import type { BookingWindowProblem } from './rules/schedule.rules.js';

/** Unpaid bookings hold their place this long; a later payment is still honoured if there is room. */
export const CHECKOUT_HOLD_MINUTES = 30;
/** Public feeds (live billboards, club rotation) are recomputed at most this often per instance. */
export const LIVE_FEED_CACHE_MS = 60_000;

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const WINDOW_MESSAGES: Readonly<Record<BookingWindowProblem, string>> = {
  'invalid-date': 'Pick a real start date (YYYY-MM-DD)',
  'invalid-length': 'Pick a valid number of days',
  'in-past': 'The start date can’t be in the past',
  'too-far': 'That start date is too far ahead',
};

/** Serialise capacity checks per board / for club rotations (transaction-scoped Postgres advisory lock). */
export async function advisoryLock(manager: EntityManager, key: string): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
}
