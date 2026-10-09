'use client';

import { ImagePlus, Mic, SendHorizontal, Trash2 } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Spinner } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { useVoiceRecorder, type VoiceClip } from '../../hooks/use-voice-recorder';
import { CHAT_MAX_LENGTH, completeMention, mentionAtCaret } from '../../services/chat-channels';
import { clipTime } from '../../services/chat-time';

export interface MentionCandidate {
  readonly handle: string;
  readonly name: string;
}

/** Voice notes and photos (private chats only). */
export interface ComposerMedia {
  /** False while a message request is pending (the buttons explain why instead). */
  readonly enabled: boolean;
  readonly lockedHint: string;
  /** An upload in flight. */
  readonly sending: boolean;
  readonly onVoice: (clip: VoiceClip) => void;
  readonly onPhoto: (file: File) => void;
}

export interface ComposerProps {
  readonly placeholder: string;
  readonly sending: boolean;
  readonly error: string | null;
  /** People you can @mention (recent senders, friends). */
  readonly candidates: readonly MentionCandidate[];
  readonly onSend: (body: string) => Promise<boolean>;
  readonly onTyping?: () => void;
  readonly media?: ComposerMedia;
}

/**
 * Message box with @mention autocomplete, a character budget and the send error (rate limits etc.) inline. In private
 * chats it also takes photos (camera button) and voice notes (mic button while the box is empty; up to 1:30).
 */
export function Composer({ placeholder, sending, error, candidates, onSend, onTyping, media }: ComposerProps) {
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const errorId = useId();
  const photoInput = useRef<HTMLInputElement>(null);
  const recorder = useVoiceRecorder((clip) => media?.onVoice(clip));
  const shownError = error ?? recorder.error;

  const mention = mentionAtCaret(text, caret);
  const matches = mention ? candidates.filter((candidate) => candidate.handle.toLowerCase().startsWith(mention.query)).slice(0, 5) : [];
  const showMatches = mention !== null && matches.length > 0;
  const remaining = CHAT_MAX_LENGTH - text.length;

  const pick = (handle: string): void => {
    if (!mention) return;
    const next = completeMention(text, mention.start, caret, handle);
    setText(next.text);
    setCaret(next.caret);
    setActive(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  const submit = async (): Promise<void> => {
    const body = text.trim();
    if (!body || sending) return;
    if (await onSend(body)) {
      setText('');
      setCaret(0);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (showMatches) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((index) => (index + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length);
        return;
      }
      if (event.key === 'Tab' || event.key === 'Enter') {
        event.preventDefault();
        const choice = matches[active] ?? matches[0];
        if (choice) pick(choice.handle);
        return;
      }
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      void submit();
    }
  };

  if (recorder.status !== 'idle') {
    const ratio = Math.min(1, recorder.elapsedMs / recorder.maxMs);
    return (
      <div className="flex items-center gap-2" role="group" aria-label="Recording a voice note">
        <button type="button" onClick={() => recorder.stop(false)} aria-label="Discard voice note" className="grid size-12 shrink-0 place-items-center rounded-full bg-paper-2 text-okada ring-1 ring-line">
          <Trash2 size={20} aria-hidden />
        </button>
        <div className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-full bg-paper-2 px-4 ring-2 ring-okada">
          <span aria-hidden className="size-2.5 shrink-0 animate-pulse rounded-full bg-okada" />
          <span className="tabular text-sm font-bold" aria-live="off">
            {recorder.status === 'starting' ? 'Starting…' : `${clipTime(recorder.elapsedMs)} / ${clipTime(recorder.maxMs)}`}
          </span>
          <span aria-hidden className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-ink/10">
            <span className="block h-full rounded-full bg-okada" style={{ width: `${ratio * 100}%` }} />
          </span>
        </div>
        <button
          type="button"
          onClick={() => recorder.stop(true)}
          disabled={recorder.status !== 'recording'}
          aria-label="Send voice note"
          className="grid size-12 shrink-0 place-items-center rounded-full bg-danfo text-ink shadow-[0_3px_0_var(--color-danfo-deep)] active:translate-y-px disabled:opacity-40"
        >
          <SendHorizontal size={20} aria-hidden />
        </button>
      </div>
    );
  }

  const micMedia = text.trim().length === 0 ? media : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {showMatches && (
        <ul id={listId} role="listbox" aria-label="Mention someone" className="flex flex-col overflow-hidden rounded-card bg-paper shadow-[var(--shadow-lift)] ring-1 ring-line">
          {matches.map((candidate, index) => (
            <li key={candidate.handle} role="option" aria-selected={index === active}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(candidate.handle)}
                className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-sm', index === active ? 'bg-danfo-soft' : 'hover:bg-paper-2')}
              >
                <span className="font-bold">@{candidate.handle}</span>
                <span className="truncate text-text-soft">{candidate.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {media && (
          <>
            <button
              type="button"
              onClick={() => photoInput.current?.click()}
              disabled={!media.enabled || media.sending}
              aria-label="Send a photo"
              title={media.enabled ? 'Send a photo' : media.lockedHint}
              className="grid size-12 shrink-0 place-items-center rounded-full bg-paper-2 text-text ring-1 ring-line hover:bg-paper-3 disabled:opacity-40"
            >
              <ImagePlus size={20} aria-hidden />
            </button>
            <input
              ref={photoInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) media.onPhoto(file);
              }}
            />
          </>
        )}
        <div className={cn('flex h-12 min-w-0 flex-1 items-center rounded-full bg-paper-2 pl-4 pr-2 ring-1 ring-line focus-within:ring-2 focus-within:ring-ink', shownError && 'ring-2 ring-okada')}>
          <input
            ref={inputRef}
            value={text}
            maxLength={CHAT_MAX_LENGTH}
            onChange={(event) => {
              setText(event.target.value);
              setCaret(event.target.selectionStart ?? event.target.value.length);
              setActive(0);
              onTyping?.();
            }}
            onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label="Message"
            aria-describedby={shownError ? errorId : undefined}
            aria-autocomplete="list"
            aria-controls={showMatches ? listId : undefined}
            aria-expanded={showMatches}
            role="combobox"
            className="h-full min-w-0 flex-1 bg-transparent text-[1rem] text-text placeholder:text-text-faint focus:outline-none"
          />
          {remaining <= 40 && <span className={cn('tabular px-1 text-xs font-bold', remaining <= 10 ? 'text-okada' : 'text-text-faint')}>{remaining}</span>}
        </div>
        {micMedia ? (
          <button
            type="button"
            onClick={() => {
              recorder.clearError();
              void recorder.start();
            }}
            disabled={!micMedia.enabled || micMedia.sending || !recorder.supported}
            aria-label="Record a voice note"
            title={!recorder.supported ? 'Voice notes aren’t supported in this browser' : micMedia.enabled ? 'Record a voice note (up to 1:30)' : micMedia.lockedHint}
            className="grid size-12 shrink-0 place-items-center rounded-full bg-danfo text-ink shadow-[0_3px_0_var(--color-danfo-deep)] active:translate-y-px disabled:opacity-40"
          >
            {micMedia.sending ? <Spinner /> : <Mic size={20} aria-hidden />}
          </button>
        ) : (
          <button
            type="submit"
            disabled={sending || text.trim().length === 0}
            aria-label="Send message"
            className="grid size-12 shrink-0 place-items-center rounded-full bg-danfo text-ink shadow-[0_3px_0_var(--color-danfo-deep)] active:translate-y-px disabled:opacity-40"
          >
            {sending ? <Spinner /> : <SendHorizontal size={20} aria-hidden />}
          </button>
        )}
      </form>
      {shownError && (
        <p id={errorId} role="alert" className="px-2 text-sm text-okada">
          {shownError}
        </p>
      )}
    </div>
  );
}
