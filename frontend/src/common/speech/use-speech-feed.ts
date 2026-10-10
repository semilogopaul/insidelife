'use client';

import { useEffect, useMemo } from 'react';
import { useSnapshot } from '@/common/game/snapshot';
import { useRealtimeEvent } from '@/common/realtime/use-realtime';
import { audible, earshotOf } from './speech-rules';
import { useSpeech } from './speech-store';

const EXPIRE_EVERY_MS = 500;

/**
 * Feed `chat:said` into the speech store (bubbles + Nearby log) for this character, drop lines from where you no
 * longer are, and expire bubbles. Mount once, in the game root.
 */
export function useSpeechFeed(selfId: string | null): void {
  const { data: snapshot } = useSnapshot();
  const locationId = snapshot?.character.locationId ?? null;
  const travelling = snapshot?.travel !== null && snapshot?.travel !== undefined;
  const here = useMemo(() => earshotOf(locationId, travelling), [locationId, travelling]);

  useEffect(() => {
    useSpeech.getState().setSelf(selfId);
  }, [selfId]);

  // Somewhere new: the bubbles you saw belong to people who aren't around any more (the log keeps their words).
  useEffect(() => {
    useSpeech.getState().clearBubbles();
  }, [here.locationId, here.outside]);

  useRealtimeEvent('chat:said', (line) => {
    if (audible(line, here, selfId)) useSpeech.getState().hear(line, Date.now());
  });

  useEffect(() => {
    const id = window.setInterval(() => useSpeech.getState().expire(Date.now()), EXPIRE_EVERY_MS);
    return () => window.clearInterval(id);
  }, []);
}
