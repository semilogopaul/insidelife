'use client';

import { create } from 'zustand';

interface DmFocusState {
  /** The DM channel on screen right now (its messages don't pop up an alert). */
  readonly channel: string | null;
  setChannel(channel: string | null): void;
}

/** Which conversation the player is looking at; set by the chat UI, read by the global DM alerts. */
export const useDmFocus = create<DmFocusState>()((set) => ({
  channel: null,
  setChannel: (channel) => set({ channel }),
}));
