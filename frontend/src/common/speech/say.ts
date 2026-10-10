'use client';

import { SPEECH_MAX_LENGTH } from '@insidelife/shared';
import { getSocket } from '@/common/realtime/socket';

const SAY_TIMEOUT_MS = 8_000;

/** A line that didn't go out; `message` is player-facing (the server's reason, e.g. the rate limit). */
export class SpeechError extends Error {}

/** What the Talk box sends: whitespace collapsed and trimmed, capped like the server. */
export function draftToLine(draft: string): string {
  return draft.replace(/\s+/g, ' ').trim().slice(0, SPEECH_MAX_LENGTH);
}

/**
 * Say something out loud (`chat:say`) and wait for the server's ack. The line comes back as `chat:said` like everyone
 * else's, so your own bubble appears exactly when others see it. Only text is ever sent.
 */
export function sayOutLoud(draft: string): Promise<void> {
  const text = draftToLine(draft);
  return new Promise<void>((resolve, reject) => {
    if (!text) {
      reject(new SpeechError('Type something first'));
      return;
    }
    const socket = getSocket();
    if (!socket.connected) {
      reject(new SpeechError('You’re offline — we’re reconnecting. Try again in a moment.'));
      return;
    }
    const timer = window.setTimeout(() => reject(new SpeechError('Nobody heard that. Check your connection and try again.')), SAY_TIMEOUT_MS);
    socket.emit('chat:say', { text }, (ack) => {
      window.clearTimeout(timer);
      if (ack.ok) resolve();
      else reject(new SpeechError(ack.error));
    });
  });
}
