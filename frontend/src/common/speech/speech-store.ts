'use client';

import { create } from 'zustand';
import type { ChatSaidDto } from '@insidelife/shared';
import { NEARBY_KEEP_MS, NEARBY_MAX_LINES, bubbleDurationMs } from './speech-rules';

/** A line in the Nearby log. */
export interface HeardLine extends ChatSaidDto {
  /** Local time it arrived (ms, `Date.now()`). */
  readonly heardAt: number;
  readonly mine: boolean;
}

/** A speech bubble over someone's head (one per speaker: a new line replaces the old one). */
export interface Bubble {
  readonly lineId: string;
  readonly characterId: string;
  readonly handle: string;
  readonly text: string;
  readonly mine: boolean;
  /** Local time (ms) it goes away. */
  readonly until: number;
}

interface SpeechState {
  /** Your character (your own bubble hangs over your avatar). */
  readonly selfId: string | null;
  /** The Nearby log, oldest first. */
  readonly lines: readonly HeardLine[];
  readonly bubbles: readonly Bubble[];
  /** The Talk box is open. */
  readonly composerOpen: boolean;
  /** Lines others said since you last opened the Talk box (the Talk button's badge). */
  readonly unread: number;
  setSelf(id: string | null): void;
  hear(line: ChatSaidDto, now: number): void;
  /** Drop bubbles (and log lines) whose time is up. */
  expire(now: number): void;
  /** You moved somewhere else: nobody's bubble is over anyone here. */
  clearBubbles(): void;
  openComposer(): void;
  closeComposer(): void;
}

/**
 * Speech bubbles and the Nearby log (client view state fed by `chat:said`, see `useSpeechFeed`). The world draws the
 * bubbles over avatars; the talk feature owns the Talk box and the log.
 */
export const useSpeech = create<SpeechState>()((set, get) => ({
  selfId: null,
  lines: [],
  bubbles: [],
  composerOpen: false,
  unread: 0,
  setSelf: (selfId) => set({ selfId }),
  hear: (line, now) => {
    const state = get();
    if (state.lines.some((existing) => existing.id === line.id)) return;
    const mine = line.characterId === state.selfId;
    const heard: HeardLine = { ...line, heardAt: now, mine };
    const bubble: Bubble = { lineId: line.id, characterId: line.characterId, handle: line.handle, text: line.text, mine, until: now + bubbleDurationMs(line.text) };
    set({
      lines: [...state.lines, heard].slice(-NEARBY_MAX_LINES),
      bubbles: [...state.bubbles.filter((existing) => existing.characterId !== line.characterId), bubble],
      unread: mine || state.composerOpen ? state.unread : state.unread + 1,
    });
  },
  expire: (now) => {
    const { bubbles, lines } = get();
    const live = bubbles.filter((bubble) => bubble.until > now);
    const kept = lines.filter((line) => now - line.heardAt < NEARBY_KEEP_MS);
    if (live.length !== bubbles.length || kept.length !== lines.length) set({ bubbles: live, lines: kept });
  },
  clearBubbles: () => set({ bubbles: [] }),
  openComposer: () => set({ composerOpen: true, unread: 0 }),
  closeComposer: () => set({ composerOpen: false }),
}));
