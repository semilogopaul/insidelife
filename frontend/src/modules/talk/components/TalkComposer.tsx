'use client';

import { Mic, MicOff, SendHorizontal, X } from 'lucide-react';
import { useCallback, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { SPEECH_MAX_LENGTH } from '@insidelife/shared';
import { gameEvents } from '@/common/game/game-events';
import { useKeyboardInset } from '@/common/hooks/use-keyboard-inset';
import { draftToLine, sayOutLoud, SpeechError, useSpeech } from '@/common/speech';
import { cn } from '@/common/utils/cn';
import { useDictation } from '../hooks/use-dictation';
import { closeTalk, registerTalkInput } from '../services/talk-focus';
import { NearbyLog } from './NearbyLog';

export interface TalkComposerProps {
  /** Where the words go (defaults to the server; tests pass their own). */
  readonly send?: (text: string) => Promise<void>;
}

/** Joins dictated words onto what was already typed, within the length cap. */
export function withDictation(before: string, dictated: string): string {
  const joined = before.trim() ? `${before.trimEnd()} ${dictated}` : dictated;
  return joined.slice(0, SPEECH_MAX_LENGTH);
}

/**
 * The Talk box: type (or dictate, where the device can do it locally) and say it out loud — it appears over your head
 * for everyone near you, and in their Nearby log. Enter or the arrow sends and closes; Esc or ✕ closes. Pinned to the
 * bottom and lifted above a phone's on-screen keyboard; the Nearby log sits above the input.
 */
export function TalkComposer({ send = sayOutLoud }: TalkComposerProps) {
  const lines = useSpeech((state) => state.lines);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inset = useKeyboardInset();
  const before = useRef('');
  const onDictated = useCallback((text: string) => setDraft(withDictation(before.current, text)), []);
  const dictation = useDictation(onDictated);
  const text = draftToLine(draft);

  const submit = async (event?: FormEvent): Promise<void> => {
    event?.preventDefault();
    if (!text || sending) return;
    dictation.stop();
    setSending(true);
    setError(null);
    try {
      await send(text);
      gameEvents.emit('sfx', { id: 'ui-click' });
      setDraft('');
      closeTalk();
    } catch (failure) {
      gameEvents.emit('sfx', { id: 'ui-error' });
      setError(failure instanceof SpeechError ? failure.message : 'Nobody heard that. Try again.');
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    dictation.stop();
    closeTalk();
  };

  const toggleMic = (): void => {
    if (dictation.listening) {
      dictation.stop();
      return;
    }
    before.current = draft;
    dictation.start();
  };

  const status = dictation.preparing ? 'Getting dictation ready on this device…' : dictation.listening ? 'Listening… speak now' : null;
  return (
    <section
      aria-label="Talk to people nearby"
      onKeyDown={onKeyDown}
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-50 flex justify-center px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] sm:px-4"
      style={inset > 0 ? { bottom: inset } : undefined}
    >
      <div className="glass w-full max-w-lg rounded-sheet p-2.5 text-on-ink">
        <div className="flex items-center justify-between px-1 pb-1.5">
          <h2 className="type-title text-base">Nearby</h2>
          <p className="text-2xs text-on-ink-soft">Everyone near you sees it over your head</p>
        </div>
        <NearbyLog lines={lines} />
        <form onSubmit={(event) => void submit(event)} className="flex items-center gap-1.5">
          <label htmlFor="talk-input" className="sr-only">
            Say something to people nearby
          </label>
          <input
            id="talk-input"
            ref={registerTalkInput}
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, SPEECH_MAX_LENGTH))}
            maxLength={SPEECH_MAX_LENGTH}
            placeholder={dictation.listening ? 'Listening…' : 'Say something…'}
            autoComplete="off"
            autoCorrect="on"
            spellCheck
            enterKeyHint="send"
            aria-describedby="talk-hint"
            aria-invalid={error ? true : undefined}
            // 16px text: iOS zooms the page into smaller inputs.
            className="h-12 min-w-0 flex-1 select-text rounded-chip bg-white/10 px-4 text-base text-on-ink placeholder:text-on-ink-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-danfo"
          />
          {dictation.supported && (
            <button
              type="button"
              onClick={toggleMic}
              disabled={dictation.preparing}
              aria-pressed={dictation.listening}
              aria-label={dictation.listening ? 'Stop dictation' : 'Dictate (speech to text on this device)'}
              className={cn('grid size-12 shrink-0 place-items-center rounded-full disabled:opacity-50', dictation.listening ? 'bg-okada text-white' : 'bg-white/10 text-on-ink')}
            >
              {dictation.listening ? <MicOff size={20} aria-hidden /> : <Mic size={20} aria-hidden />}
            </button>
          )}
          <button type="submit" disabled={!text || sending} aria-label="Say it" className="grid size-12 shrink-0 place-items-center rounded-full bg-danfo text-ink disabled:opacity-40">
            <SendHorizontal size={20} aria-hidden strokeWidth={2.4} />
          </button>
          <button
            type="button"
            onClick={() => {
              dictation.stop();
              closeTalk();
            }}
            aria-label="Close Talk"
            className="grid size-10 shrink-0 place-items-center rounded-full text-on-ink-soft hover:text-on-ink"
          >
            <X size={20} aria-hidden />
          </button>
        </form>
        <p id="talk-hint" className="flex justify-between gap-2 px-1 pt-1.5 text-2xs text-on-ink-soft">
          <span aria-live="polite">{status ?? 'No links or phone numbers. Be nice.'}</span>
          <span className="tabular shrink-0">
            {draft.length}/{SPEECH_MAX_LENGTH}
          </span>
        </p>
        {(error ?? dictation.error) && (
          <p role="alert" className="px-1 pt-1 text-xs font-bold text-danfo">
            {error ?? dictation.error}
          </p>
        )}
      </div>
    </section>
  );
}
