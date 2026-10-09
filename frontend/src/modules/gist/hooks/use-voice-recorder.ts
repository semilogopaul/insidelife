'use client';

import { CHAT_VOICE_MAX_SECONDS } from '@insidelife/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

/** What the server accepts, best first (Chrome/Android/Firefox record WebM; Safari records MP4). */
const PREFERRED_TYPES = [
  { mime: 'audio/webm;codecs=opus', extension: 'webm' },
  { mime: 'audio/webm', extension: 'webm' },
  { mime: 'audio/mp4', extension: 'm4a' },
  { mime: 'audio/ogg;codecs=opus', extension: 'ogg' },
] as const;
/** Clear speech, small files (~250 KB for 1:30) on Nigerian mobile data. */
const BITS_PER_SECOND = 24_000;
const MAX_MS = CHAT_VOICE_MAX_SECONDS * 1000;

export interface VoiceClip {
  readonly file: File;
  readonly durationMs: number;
}

export type RecorderStatus = 'idle' | 'starting' | 'recording';

const supportedType = () => (typeof MediaRecorder === 'undefined' ? null : (PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported(type.mime)) ?? null));

/**
 * Microphone recording for voice notes (MediaRecorder). `start()` asks for the mic; `stop(true)` hands the clip to
 * `onClip`, `stop(false)` throws it away. Recording stops by itself at 1:30. Releases the mic on stop and unmount.
 */
export function useVoiceRecorder(onClip: (clip: VoiceClip) => void) {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const keep = useRef(false);
  const startedAt = useRef(0);
  const ticker = useRef<number | null>(null);
  const onClipRef = useRef(onClip);
  useEffect(() => {
    onClipRef.current = onClip;
  }, [onClip]);

  const release = useCallback(() => {
    if (ticker.current !== null) window.clearInterval(ticker.current);
    ticker.current = null;
    for (const track of stream.current?.getTracks() ?? []) track.stop();
    stream.current = null;
    recorder.current = null;
  }, []);

  const stop = useCallback((send: boolean) => {
    keep.current = send;
    const active = recorder.current;
    if (active && active.state !== 'inactive') active.stop();
    else {
      release();
      setStatus('idle');
    }
  }, [release]);

  const start = useCallback(async () => {
    const type = supportedType();
    if (!type || !navigator.mediaDevices?.getUserMedia) {
      setError('Voice notes aren’t supported in this browser.');
      return;
    }
    setError(null);
    setStatus('starting');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    } catch (caught) {
      setStatus('idle');
      setError(caught instanceof DOMException && caught.name === 'NotAllowedError' ? 'Allow microphone access to send voice notes.' : 'We couldn’t reach your microphone.');
      return;
    }
    const chunks: Blob[] = [];
    const active = new MediaRecorder(stream.current, { mimeType: type.mime, audioBitsPerSecond: BITS_PER_SECOND });
    active.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    active.onstop = () => {
      const durationMs = Math.min(MAX_MS, Date.now() - startedAt.current);
      release();
      setStatus('idle');
      setElapsedMs(0);
      if (!keep.current || chunks.length === 0) return;
      const mime = type.mime.split(';')[0] ?? type.mime;
      onClipRef.current({ file: new File(chunks, `voice-note.${type.extension}`, { type: mime }), durationMs });
    };
    recorder.current = active;
    keep.current = false;
    startedAt.current = Date.now();
    active.start(500);
    setElapsedMs(0);
    setStatus('recording');
    ticker.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      setElapsedMs(elapsed);
      if (elapsed >= MAX_MS) stop(true);
    }, 200);
  }, [release, stop]);

  useEffect(() => () => {
    keep.current = false;
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
    release();
  }, [release]);

  return { status, elapsedMs, maxMs: MAX_MS, error, clearError: () => setError(null), supported: supportedType() !== null, start, stop };
}
