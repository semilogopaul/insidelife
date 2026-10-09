'use client';

import { Pause, Play } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ChatMediaDto } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';
import { clipTime } from '../../services/chat-time';

/** Only one voice note plays at a time. */
let playing: HTMLAudioElement | null = null;

/** A voice-note bubble: play/pause, progress and time (the recorder's length, since streamed WebM has no duration). */
export function VoiceNote({ media, onDark, from }: { readonly media: ChatMediaDto; readonly onDark: boolean; readonly from: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const totalMs = media.durationMs ?? 0;
  const progress = totalMs > 0 ? Math.min(1, positionMs / totalMs) : 0;

  const toggle = (): void => {
    const element = audio.current;
    if (!element) return;
    if (!element.paused) {
      element.pause();
      return;
    }
    if (playing && playing !== element) playing.pause();
    playing = element;
    void element.play().catch(() => setIsPlaying(false));
  };

  return (
    <div className="flex items-center gap-2.5 py-0.5">
      <button
        type="button"
        onClick={toggle}
        aria-label={`${isPlaying ? 'Pause' : 'Play'} voice note from ${from}, ${clipTime(totalMs)}`}
        className={cn('grid size-10 shrink-0 place-items-center rounded-full', onDark ? 'bg-danfo text-ink' : 'bg-ink text-on-ink')}
      >
        {isPlaying ? <Pause size={18} aria-hidden fill="currentColor" /> : <Play size={18} aria-hidden fill="currentColor" className="translate-x-px" />}
      </button>
      <div className="flex min-w-[8.5rem] flex-1 flex-col gap-1">
        <div aria-hidden className={cn('h-1.5 overflow-hidden rounded-full', onDark ? 'bg-on-ink/25' : 'bg-ink/15')}>
          <div className={cn('h-full rounded-full transition-[width] duration-200', onDark ? 'bg-danfo' : 'bg-ink')} style={{ width: `${progress * 100}%` }} />
        </div>
        <span className={cn('tabular text-2xs font-bold', onDark ? 'text-on-ink-soft' : 'text-text-soft')}>{clipTime(isPlaying || positionMs > 0 ? positionMs : totalMs)}</span>
      </div>
      <audio
        ref={audio}
        src={media.url}
        preload="none"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(event) => setPositionMs(event.currentTarget.currentTime * 1000)}
        onEnded={() => {
          setIsPlaying(false);
          setPositionMs(0);
          if (playing === audio.current) playing = null;
        }}
      />
    </div>
  );
}
