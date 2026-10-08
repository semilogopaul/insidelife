'use client';

import { create } from 'zustand';
import type { LifeEventOutcomeDto } from '@insidelife/shared';

interface LifeEventsUiState {
  /** The player wants the decision card visible. */
  readonly open: boolean;
  /** Event ids already auto-opened once (so "Decide later" sticks until something new arrives). */
  readonly announced: ReadonlySet<string>;
  /** The outcome being revealed for an event just answered. */
  readonly reveal: { readonly eventId: string; readonly title: string; readonly outcome: LifeEventOutcomeDto } | null;
  setOpen(open: boolean): void;
  announce(ids: readonly string[]): void;
  showOutcome(eventId: string, title: string, outcome: LifeEventOutcomeDto): void;
  clearOutcome(): void;
}

/** Client UI state for life-event cards (the HUD chip and the card share it). */
export const useLifeEventsUi = create<LifeEventsUiState>()((set) => ({
  open: false,
  announced: new Set(),
  reveal: null,
  setOpen: (open) => set({ open }),
  announce: (ids) =>
    set((state) => {
      const fresh = ids.filter((id) => !state.announced.has(id));
      if (fresh.length === 0) return state;
      const announced = new Set(state.announced);
      for (const id of fresh) announced.add(id);
      return { announced, open: true };
    }),
  showOutcome: (eventId, title, outcome) => set({ reveal: { eventId, title, outcome } }),
  clearOutcome: () => set({ reveal: null }),
}));
