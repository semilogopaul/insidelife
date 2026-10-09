'use client';

import { create } from 'zustand';
import type { NightOutSection } from '@insidelife/shared';
import { useUi } from '@/common/game/ui-store';

interface NightOutNavState {
  /** A pending "open the Night out panel on this section" (the nonce makes repeat taps count). */
  readonly request: { readonly section: NightOutSection; readonly nonce: number } | null;
  open(section: NightOutSection): void;
  /** The Here tab handled it. */
  consume(): void;
}

let nonce = 0;

export const useNightOutNav = create<NightOutNavState>()((set) => ({
  request: null,
  open: (section) => set({ request: { section, nonce: ++nonce } }),
  consume: () => set({ request: null }),
}));

/**
 * Public entry point: open the phone on Gist → Here with the Night out panel on `section`. For 3D hotspots and other
 * features (they can't import Gist): the bar calls `openNightOut('bottles')`, the DJ booth `openNightOut('shoutout')`.
 * Works from anywhere (no React needed); the panel explains itself when you're not in an open club or bar.
 */
export function openNightOut(section: NightOutSection = 'bottles'): void {
  useNightOutNav.getState().open(section);
  useUi.getState().openPhone('gist', 'here');
}
