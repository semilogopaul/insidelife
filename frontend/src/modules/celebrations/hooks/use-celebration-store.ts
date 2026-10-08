'use client';

import { create } from 'zustand';
import type { MilestoneMomentDto, MilestoneStatDto } from '@insidelife/shared';

/** A full-screen milestone moment waiting to be shown. */
export interface CelebrationMoment {
  readonly key: string;
  /** Server milestone id to acknowledge on close (null for client-side celebrations). */
  readonly serverId: string | null;
  readonly title: string;
  readonly body: string;
  /** lucide icon name. */
  readonly icon: string;
  readonly shareText: string | null;
  readonly stats: readonly MilestoneStatDto[];
}

/** A smaller, toast-level celebration (achievement unlocked, Life Goal complete). */
export interface BadgeCelebration {
  readonly key: string;
  readonly kind: 'achievement' | 'goal';
  readonly title: string;
  readonly body: string | null;
}

interface CelebrationState {
  readonly moments: readonly CelebrationMoment[];
  readonly badges: readonly BadgeCelebration[];
  /** Keys already queued this session (server pushes and the pending list can overlap). */
  readonly seen: ReadonlySet<string>;
  /** Moments queued in the current back-to-back run (for "2 of 3"); resets when the queue empties. */
  readonly runTotal: number;
  enqueueMoment(moment: CelebrationMoment): void;
  dismissMoment(key: string): void;
  enqueueBadge(badge: BadgeCelebration): void;
  dismissBadge(key: string): void;
}

export const useCelebrations = create<CelebrationState>()((set) => ({
  moments: [],
  badges: [],
  seen: new Set(),
  runTotal: 0,
  enqueueMoment: (moment) =>
    set((state) =>
      state.seen.has(moment.key)
        ? state
        : {
            moments: [...state.moments, moment],
            seen: new Set(state.seen).add(moment.key),
            runTotal: state.moments.length === 0 ? 1 : state.runTotal + 1,
          },
    ),
  dismissMoment: (key) =>
    set((state) => {
      const moments = state.moments.filter((moment) => moment.key !== key);
      return { moments, runTotal: moments.length === 0 ? 0 : state.runTotal };
    }),
  enqueueBadge: (badge) =>
    set((state) => (state.seen.has(badge.key) ? state : { badges: [...state.badges.slice(-4), badge], seen: new Set(state.seen).add(badge.key) })),
  dismissBadge: (key) => set((state) => ({ badges: state.badges.filter((badge) => badge.key !== key) })),
}));

export function momentFromServer(dto: MilestoneMomentDto): CelebrationMoment {
  return { key: `milestone:${dto.id}`, serverId: dto.id, title: dto.title, body: dto.body, icon: dto.icon, shareText: dto.shareText, stats: dto.stats };
}
