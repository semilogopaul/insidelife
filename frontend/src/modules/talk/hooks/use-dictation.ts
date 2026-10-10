'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  dictationError,
  findLocalDictation,
  recognitionConstructor,
  transcriptOf,
  type LocalDictation,
  type Recognition,
} from '../services/dictation';

export interface Dictation {
  /** The mic can be offered (on-device recognition exists here). */
  readonly supported: boolean;
  readonly listening: boolean;
  /** Fetching the on-device language model (first use only). */
  readonly preparing: boolean;
  readonly error: string | null;
  start(): void;
  stop(): void;
}

/**
 * Dictate into the Talk box: on-device speech recognition only (see `services/dictation.ts`). `onText` receives the
 * whole transcript of the current session as it grows.
 */
export function useDictation(onText: (text: string, final: boolean) => void): Dictation {
  const [local, setLocal] = useState<LocalDictation | null>(null);
  const [listening, setListening] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const textRef = useRef(onText);
  useEffect(() => {
    textRef.current = onText;
  });

  useEffect(() => {
    let cancelled = false;
    void findLocalDictation(recognitionConstructor(), typeof navigator === 'undefined' ? [] : navigator.languages).then((found) => {
      if (!cancelled) setLocal(found);
    });
    return () => {
      cancelled = true;
      recognition.current?.abort();
    };
  }, []);

  const stop = useCallback(() => {
    recognition.current?.stop();
  }, []);

  const start = useCallback(() => {
    const ctor = recognitionConstructor();
    if (!ctor || !local || recognition.current) return;
    setError(null);
    const begin = (): void => {
      const session = new ctor();
      session.lang = local.lang;
      session.interimResults = true;
      session.continuous = false;
      session.maxAlternatives = 1;
      // Never the vendor's cloud: if the browser can't keep it local, it fails instead of sending audio away.
      session.processLocally = true;
      session.onresult = (event) => {
        const { text, final } = transcriptOf(event);
        textRef.current(text, final);
      };
      session.onerror = (event) => setError(dictationError(event.error));
      session.onend = () => {
        recognition.current = null;
        setListening(false);
      };
      recognition.current = session;
      try {
        session.start();
        setListening(true);
      } catch {
        recognition.current = null;
        setError('Dictation couldn’t start. Type it instead.');
      }
    };
    if (!local.needsInstall || !ctor.install) {
      begin();
      return;
    }
    // First use: the browser downloads its on-device model for this language (free, once).
    setPreparing(true);
    void ctor
      .install({ langs: [local.lang], processLocally: true })
      .then((ok) => {
        setPreparing(false);
        if (!ok) {
          setError('Dictation isn’t ready on this device. Type it instead.');
          return;
        }
        setLocal({ lang: local.lang, needsInstall: false });
        begin();
      })
      .catch(() => {
        setPreparing(false);
        setError('Dictation isn’t ready on this device. Type it instead.');
      });
  }, [local]);

  return { supported: local !== null, listening, preparing, error, start, stop };
}
