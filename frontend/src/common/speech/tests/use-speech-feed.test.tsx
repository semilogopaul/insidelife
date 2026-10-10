import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatSaidDto } from '@insidelife/shared';

const handlers = new Map<string, (payload: unknown) => void>();
vi.mock('@/common/realtime/use-realtime', () => ({
  useRealtimeEvent: (event: string, handler: (payload: unknown) => void) => {
    handlers.set(event, handler);
  },
}));
let location = { locationId: 'street:yaba', travel: null as unknown };
vi.mock('@/common/game/snapshot', () => ({
  useSnapshot: () => ({ data: { character: { locationId: location.locationId }, travel: location.travel } }),
}));

const { useSpeech, useSpeechFeed } = await import('..');

const said = (overrides: Partial<ChatSaidDto>): ChatSaidDto => ({
  id: 'l1',
  characterId: 'kemi',
  handle: 'kemi_o',
  firstName: 'Kemi',
  text: 'How far?',
  at: 1,
  scope: 'street',
  locationId: 'street:yaba',
  ...overrides,
});

describe('useSpeechFeed', () => {
  beforeEach(() => {
    handlers.clear();
    location = { locationId: 'street:yaba', travel: null };
    useSpeech.setState({ selfId: null, lines: [], bubbles: [], composerOpen: false, unread: 0 });
  });

  it('puts what people around you say into bubbles and the log', () => {
    renderHook(() => useSpeechFeed('ada'));
    expect(useSpeech.getState().selfId).toBe('ada');
    act(() => handlers.get('chat:said')?.(said({})));
    expect(useSpeech.getState().bubbles.map((bubble) => bubble.text)).toEqual(['How far?']);
    expect(useSpeech.getState().lines).toHaveLength(1);
  });

  it('drops lines from where you no longer are, and clears bubbles when you move', () => {
    const { rerender } = renderHook(() => useSpeechFeed('ada'));
    act(() => handlers.get('chat:said')?.(said({ id: 'a' })));
    location = { locationId: 'vi-lounge', travel: null };
    rerender();
    expect(useSpeech.getState().bubbles).toEqual([]);
    expect(useSpeech.getState().lines).toHaveLength(1);
    act(() => handlers.get('chat:said')?.(said({ id: 'b' })));
    act(() => handlers.get('chat:said')?.(said({ id: 'c', scope: 'place', locationId: 'vi-lounge' })));
    expect(useSpeech.getState().lines.map((line) => line.id)).toEqual(['a', 'c']);
  });

  it('expires bubbles on a timer', () => {
    vi.useFakeTimers();
    try {
      renderHook(() => useSpeechFeed('ada'));
      act(() => handlers.get('chat:said')?.(said({})));
      expect(useSpeech.getState().bubbles).toHaveLength(1);
      act(() => vi.advanceTimersByTime(11_000));
      expect(useSpeech.getState().bubbles).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
