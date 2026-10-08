'use client';

import { create } from 'zustand';
import type { NowPlayingTrack } from '../types/audio';

interface NowPlayingState {
  /** The paid club track playing right now, or null (procedural groove / outside a club). */
  readonly track: NowPlayingTrack | null;
  setTrack(track: NowPlayingTrack | null): void;
}

/** "Now playing: Artist — Title" while a player-paid track plays in a club. Written only by the audio engine. */
export const useNowPlaying = create<NowPlayingState>()((set) => ({
  track: null,
  setTrack: (track) => set({ track }),
}));
