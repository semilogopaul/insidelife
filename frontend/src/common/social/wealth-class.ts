'use client';

import { create } from 'zustand';
import { WEALTH_CLASS_COPY, type WealthClass } from '@insidelife/shared';

/**
 * Who is nepo and who is lapo, by character id. The server decides the class and sends it with presence, chat, speech
 * and player cards; this remembers it so a name tag or bubble can be coloured before any card has loaded. Clients never
 * compute it from balances.
 */
interface WealthClassState {
  readonly byId: Readonly<Record<string, WealthClass>>;
  remember(characterId: string, wealthClass: WealthClass | undefined): void;
}

export const useWealthClasses = create<WealthClassState>()((set, get) => ({
  byId: {},
  remember: (characterId, wealthClass) => {
    if (!wealthClass || get().byId[characterId] === wealthClass) return;
    set((state) => ({ byId: { ...state.byId, [characterId]: wealthClass } }));
  },
}));

/** Non-React access (the presence directory, socket handlers). */
export function rememberWealthClass(characterId: string, wealthClass: WealthClass | undefined): void {
  useWealthClasses.getState().remember(characterId, wealthClass);
}

export function useWealthClass(characterId: string | undefined, fallback?: WealthClass): WealthClass | undefined {
  return useWealthClasses((state) => (characterId ? state.byId[characterId] : undefined)) ?? fallback;
}

/** Text colour classes: gold for nepo, blue for lapo, in the shade that reads on the surface. */
export function wealthNameClass(wealthClass: WealthClass | undefined, onDark = false): string {
  if (!wealthClass) return '';
  if (wealthClass === 'nepo') return onDark ? 'text-nepo-on-dark' : 'text-nepo';
  return onDark ? 'text-lapo-on-dark' : 'text-lapo';
}

export function wealthLabel(wealthClass: WealthClass): string {
  return WEALTH_CLASS_COPY[wealthClass].label;
}
