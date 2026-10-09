'use client';

import { create } from 'zustand';
import { NIGHT_OUT_RULES, type VenueMomentDto } from '@insidelife/shared';

/**
 * Paid moments at the club or bar you're in (bottles, shoutouts, experiences), on the server clock. Fed by
 * `useVenueMomentsFeed` (the venue's queue when you walk in, then realtime `venue:moment`); read by the HUD banner and
 * the 3D room. Client view state only: the server decides what plays and when.
 */
interface VenueMomentsState {
  readonly venueId: string | null;
  readonly moments: readonly VenueMomentDto[];
  /** You walked into (or out of) a place: forget the last room's moments. */
  enter(venueId: string | null): void;
  /** New or replayed moments (duplicates and other rooms' moments are ignored). */
  add(moments: readonly VenueMomentDto[], nowMs: number): void;
}

export const useVenueMoments = create<VenueMomentsState>()((set) => ({
  venueId: null,
  moments: [],
  enter: (venueId) => set((state) => (state.venueId === venueId ? state : { venueId, moments: [] })),
  add: (incoming, nowMs) =>
    set((state) => {
      if (!state.venueId) return state;
      const merged = mergeMoments(state.moments, incoming, state.venueId, nowMs);
      return merged === state.moments ? state : { moments: merged };
    }),
}));

export const momentEndsAt = (moment: VenueMomentDto): number => moment.startsAt + moment.durationMs;

export const isMomentLive = (moment: VenueMomentDto, nowMs: number): boolean => nowMs >= moment.startsAt && nowMs < momentEndsAt(moment);

/** How long the HUD banner stays up: the moment itself, except the VIP section (its sign stays until closing). */
export function bannerEndsAt(moment: VenueMomentDto): number {
  return moment.kind === 'vip-section' ? Math.min(momentEndsAt(moment), moment.startsAt + NIGHT_OUT_RULES.vipBannerMs) : momentEndsAt(moment);
}

/** Add moments for this place, drop duplicates and anything finished, keep them in play order. Pure. */
export function mergeMoments(current: readonly VenueMomentDto[], incoming: readonly VenueMomentDto[], venueId: string, nowMs: number): readonly VenueMomentDto[] {
  const known = new Set(current.map((moment) => moment.id));
  const fresh = incoming.filter((moment) => moment.venueId === venueId && !known.has(moment.id) && momentEndsAt(moment) > nowMs);
  const stale = current.some((moment) => momentEndsAt(moment) <= nowMs);
  if (fresh.length === 0 && !stale) return current;
  return [...current.filter((moment) => momentEndsAt(moment) > nowMs), ...fresh].toSorted((a, b) => a.startsAt - b.startsAt);
}

export interface BannerMoments {
  /** The shoutout on screen (the server queues them, so there's at most one). */
  readonly headline: VenueMomentDto | null;
  /** Bottles and experiences playing now, newest first (at most `max`). */
  readonly others: readonly VenueMomentDto[];
}

/** What the HUD shows right now. Pure. */
export function bannerMoments(moments: readonly VenueMomentDto[], nowMs: number, max = 2): BannerMoments {
  const showing = moments.filter((moment) => nowMs >= moment.startsAt && nowMs < bannerEndsAt(moment));
  return {
    headline: showing.find((moment) => moment.kind === 'shoutout') ?? null,
    others: showing
      .filter((moment) => moment.kind !== 'shoutout')
      .toSorted((a, b) => b.startsAt - a.startsAt)
      .slice(0, max),
  };
}

/** Moments playing in the room right now (3D effects, including the VIP sign until closing). Pure. */
export const liveMoments = (moments: readonly VenueMomentDto[], nowMs: number): readonly VenueMomentDto[] => moments.filter((moment) => isMomentLive(moment, nowMs));

/** The next time something starts or stops (banner or effect), so views re-render only then. Pure. */
export function nextMomentChange(moments: readonly VenueMomentDto[], nowMs: number): number | null {
  let next: number | null = null;
  for (const moment of moments) {
    for (const at of [moment.startsAt, bannerEndsAt(moment), momentEndsAt(moment)]) {
      if (at > nowMs && (next === null || at < next)) next = at;
    }
  }
  return next;
}

/** Whoever holds the VIP section here right now. */
export const vipMoment = (moments: readonly VenueMomentDto[], nowMs: number): VenueMomentDto | null =>
  moments.find((moment) => moment.kind === 'vip-section' && isMomentLive(moment, nowMs)) ?? null;
