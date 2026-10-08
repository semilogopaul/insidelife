import { MINUTES_PER_DAY, isFamilyKind, isRomanticKind, type RelationshipKind } from '@insidelife/shared';

/** How quickly a relationship cools when you don't keep in touch. */
export interface DecayProfile {
  /** Days without contact before closeness starts to fade. */
  readonly graceDays: number;
  readonly closenessPerDay: number;
  /** Closeness never fades below this (blood is thicker than water). */
  readonly closenessFloor: number;
  readonly romanceGraceDays: number;
  readonly romancePerDay: number;
}

export function decayProfile(kind: RelationshipKind): DecayProfile {
  if (isFamilyKind(kind)) return { graceDays: 14, closenessPerDay: 0.2, closenessFloor: 15, romanceGraceDays: 0, romancePerDay: 0 };
  if (kind === 'spouse') return { graceDays: 7, closenessPerDay: 0.25, closenessFloor: 10, romanceGraceDays: 7, romancePerDay: 0.35 };
  if (isRomanticKind(kind)) return { graceDays: 5, closenessPerDay: 0.3, closenessFloor: 5, romanceGraceDays: 5, romancePerDay: 0.5 };
  if (kind === 'ex') return { graceDays: 0, closenessPerDay: 0.3, closenessFloor: 0, romanceGraceDays: 0, romancePerDay: 1 };
  return { graceDays: 7, closenessPerDay: 0.4, closenessFloor: 0, romanceGraceDays: 7, romancePerDay: 0.5 };
}

export const clampStat = (value: number): number => Math.max(0, Math.min(100, value));

function decay(stored: number, since: number, t: number, graceDays: number, perDay: number, floor: number): number {
  if (stored <= floor || perDay <= 0) return stored;
  const idleDays = Math.max(0, (t - since) / MINUTES_PER_DAY - graceDays);
  return Math.max(floor, stored - idleDays * perDay);
}

/** Closeness at time `t`, given the value stored at the last contact (closed form: no daily writes). */
export function effectiveCloseness(rel: { readonly closeness: number; readonly lastContactAt: number; readonly kind: RelationshipKind }, t: number): number {
  const profile = decayProfile(rel.kind);
  return decay(rel.closeness, rel.lastContactAt, t, profile.graceDays, profile.closenessPerDay, profile.closenessFloor);
}

/** Romance at time `t`; long distance (partner abroad) doubles the fade. */
export function effectiveRomance(
  rel: { readonly romance: number; readonly lastRomanceAt: number; readonly kind: RelationshipKind },
  t: number,
  longDistance = false,
): number {
  const profile = decayProfile(rel.kind);
  return decay(rel.romance, rel.lastRomanceAt, t, profile.romanceGraceDays, profile.romancePerDay * (longDistance ? 2 : 1), 0);
}
