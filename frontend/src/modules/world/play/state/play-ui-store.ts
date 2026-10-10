'use client';

import { create } from 'zustand';
import type { Interactable } from '@/common/game/world-store';

/**
 * Low-rate UI state shared between the in-canvas play layer and its DOM overlay (never written per frame).
 */

export interface SponsorLink {
  readonly title: string;
  readonly url: string;
  readonly host: string;
}

export interface RemoteTag {
  readonly id: string;
  readonly handle: string;
}

interface PlayUiState {
  /** A billboard creative the player tapped: the "Open sponsor link?" sheet. */
  readonly sponsor: SponsorLink | null;
  /** Dip to dark while walking through a door. */
  readonly fading: boolean;
  /** Name tags to render (nearest other players). */
  readonly tags: readonly RemoteTag[];
  /** The play layer is mounted and accepting input (controls show only then). */
  readonly active: boolean;
  /**
   * At the wheel on a touch screen: what you can do where you've stopped ("Park & enter …", fill up, see the
   * mechanic). The drive controls show it, so it works with the HUD hidden (clean screen) too.
   */
  readonly driveOffer: Interactable | null;
  setSponsor(sponsor: SponsorLink | null): void;
  setFading(fading: boolean): void;
  setTags(tags: readonly RemoteTag[]): void;
  setActive(active: boolean): void;
  setDriveOffer(offer: Interactable | null): void;
}

export const usePlayUi = create<PlayUiState>()((set) => ({
  sponsor: null,
  fading: false,
  tags: [],
  active: false,
  driveOffer: null,
  setSponsor: (sponsor) => set({ sponsor }),
  setFading: (fading) => set({ fading }),
  setTags: (tags) => set({ tags }),
  setActive: (active) => set({ active }),
  setDriveOffer: (driveOffer) => set({ driveOffer }),
}));

/** DOM elements of the name tags, positioned by the frame loop (no React re-render per frame). */
export const tagElements = new Map<string, HTMLElement>();
