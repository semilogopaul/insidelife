import { VISIT_RULES, type VisitStatus } from '@insidelife/shared';

/** "@tolu_b" → "tolu_b". */
export const normaliseHandle = (handle: string): string => handle.trim().toLowerCase().replace(/^@/, '');

/** Still on: invited or accepted, and not past its time. */
export function isOpenVisit(
  visit: { readonly status: VisitStatus; readonly expiresAt: number },
  now: number,
): boolean {
  return (visit.status === 'invited' || visit.status === 'accepted') && visit.expiresAt > now;
}

/** May the guest come in (or ride over) right now? */
export function canEnter(
  visit: { readonly status: VisitStatus; readonly expiresAt: number },
  now: number,
): boolean {
  return visit.status === 'accepted' && visit.expiresAt > now;
}

/** When an invite sent (or accepted) now runs out. */
export const visitExpiry = (now: number): number => now + VISIT_RULES.ttlMinutes;

/** `home:<hostId>` → hostId (null for anything else). */
export function hostOf(locationId: string): string | null {
  return locationId.startsWith('home:') ? locationId.slice('home:'.length) : null;
}
