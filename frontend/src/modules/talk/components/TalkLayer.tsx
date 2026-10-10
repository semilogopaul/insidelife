'use client';

import { useEffect } from 'react';
import { useUi } from '@/common/game/ui-store';
import { useSpeech } from '@/common/speech';
import { useTalkKey } from '../hooks/use-talk-key';
import { closeTalk } from '../services/talk-focus';
import { NearbyAnnouncer, NearbyFeed } from './NearbyLog';
import { TalkComposer } from './TalkComposer';

/**
 * The brief Nearby feed for the HUD (under the needs panel): the last few lines while the Talk box is closed. It goes
 * with the HUD on a clean screen; bubbles and the announcer don't.
 */
export function TalkFeed() {
  const open = useSpeech((state) => state.composerOpen);
  const lines = useSpeech((state) => state.lines);
  return open ? null : <NearbyFeed lines={lines} />;
}

/**
 * Talking out loud, minus what lives on the HUD (`TalkButton`, `TalkFeed`): the Talk box when open, the screen-reader
 * announcer (always, clean screen too) and the T key. Bubbles over heads are drawn by the world. Mount once, after
 * the HUD.
 */
export function TalkLayer() {
  const open = useSpeech((state) => state.composerOpen);
  const lines = useSpeech((state) => state.lines);
  const phoneOpen = useUi((state) => state.phoneOpen);
  useTalkKey();

  // The phone takes the screen: put the Talk box away.
  useEffect(() => {
    if (phoneOpen && useSpeech.getState().composerOpen) closeTalk();
  }, [phoneOpen]);

  return (
    <>
      {open && !phoneOpen && <TalkComposer />}
      <NearbyAnnouncer lines={lines} />
    </>
  );
}
