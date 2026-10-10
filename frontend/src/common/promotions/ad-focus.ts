'use client';

import { create } from 'zustand';

/**
 * "See it in Lagos": the GPS can lead to an ad spot (destination id `ad:<slotId>`), and the 3D city highlights a board
 * briefly when the player arrives (or asks to see it). Promote sets the destination; the world resolves it to the
 * board's viewing point (`adViewingPoint`) and calls `highlightAd` on arrival; the billboard renderers read the store.
 */

const AD_DESTINATION_PREFIX = 'ad:';
/** How long a board glows after you arrive. */
export const AD_HIGHLIGHT_MS = 6_000;

export const adDestinationId = (slotId: string): string => `${AD_DESTINATION_PREFIX}${slotId}`;

/** The slot id of an `ad:<slotId>` navigation destination, or null. */
export function adSlotOfDestination(destinationId: string | null | undefined): string | null {
  return destinationId?.startsWith(AD_DESTINATION_PREFIX) ? destinationId.slice(AD_DESTINATION_PREFIX.length) || null : null;
}

interface AdFocusState {
  /** The board to highlight, from `since` until `until` (epoch ms). */
  readonly slotId: string | null;
  readonly since: number;
  readonly until: number;
  highlightAd(slotId: string, durationMs?: number): void;
  clear(): void;
}

export const useAdFocus = create<AdFocusState>()((set) => ({
  slotId: null,
  since: 0,
  until: 0,
  highlightAd: (slotId, durationMs = AD_HIGHLIGHT_MS) => {
    const now = Date.now();
    set({ slotId, since: now, until: now + Math.max(1, durationMs) });
  },
  clear: () => set({ slotId: null, since: 0, until: 0 }),
}));

/** For frame loops: the highlighted slot right now and how far into the highlight we are (0–1), or null. */
export function activeAdHighlight(now: number = Date.now()): { readonly slotId: string; readonly progress: number } | null {
  const { slotId, since, until } = useAdFocus.getState();
  if (!slotId || now >= until) return null;
  return { slotId, progress: Math.max(0, Math.min(1, (now - since) / Math.max(1, until - since))) };
}
