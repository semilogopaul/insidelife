'use client';

import { create } from 'zustand';
import { BETTING_RULES, type BetLegRequest, type BetSelectionId } from '@insidelife/shared';

/**
 * The slip being built (client UI state only): which selections are picked and the stake typed. One pick per match —
 * tapping another selection of the same match swaps it, tapping the same one removes it. Prices and returns are never
 * kept here; the drawer asks the server for them.
 */
interface SlipState {
  readonly picks: readonly BetLegRequest[];
  readonly stake: number;
  toggle(matchId: string, selection: BetSelectionId): void;
  remove(matchId: string): void;
  /** Drop picks whose match is no longer on the board (it kicked off). */
  keepOnly(matchIds: ReadonlySet<string>): void;
  setStake(stake: number): void;
  clear(): void;
}

export const DEFAULT_STAKE = 500;

export const useSlip = create<SlipState>()((set) => ({
  picks: [],
  stake: DEFAULT_STAKE,
  toggle: (matchId, selection) =>
    set((state) => {
      const current = state.picks.find((pick) => pick.matchId === matchId);
      if (current?.selection === selection) return { picks: state.picks.filter((pick) => pick.matchId !== matchId) };
      if (current) return { picks: state.picks.map((pick) => (pick.matchId === matchId ? { matchId, selection } : pick)) };
      if (state.picks.length >= BETTING_RULES.maxLegs) return state;
      return { picks: [...state.picks, { matchId, selection }] };
    }),
  remove: (matchId) => set((state) => ({ picks: state.picks.filter((pick) => pick.matchId !== matchId) })),
  keepOnly: (matchIds) =>
    set((state) => {
      const kept = state.picks.filter((pick) => matchIds.has(pick.matchId));
      return kept.length === state.picks.length ? state : { picks: kept };
    }),
  setStake: (stake) => set({ stake: Math.max(0, Math.floor(stake)) }),
  clear: () => set({ picks: [] }),
}));
