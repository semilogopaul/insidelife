'use client';

import { useEffect, useRef, useState } from 'react';
import { FEED_MAX_LINES, FEED_MS, type HeardLine } from '@/common/speech';
import { cn } from '@/common/utils/cn';

/** "now", "40s", "3m": how long ago a line was heard. */
export function agoLabel(heardAt: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - heardAt) / 1000));
  if (seconds < 10) return 'now';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m`;
}

/** Re-render every `ms` (for "40s ago" labels and fading lines); never per frame. */
function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

function Speaker({ line }: { readonly line: HeardLine }) {
  return line.mine ? (
    <span className="font-bold text-danfo">You</span>
  ) : (
    <span className="font-bold text-on-ink">
      {line.firstName} <span className="font-normal text-on-ink-soft">@{line.handle}</span>
    </span>
  );
}

/** The Nearby log inside the Talk box: what people around you said lately (newest at the bottom). */
export function NearbyLog({ lines }: { readonly lines: readonly HeardLine[] }) {
  const now = useNow(10_000);
  const list = useRef<HTMLOListElement>(null);
  const last = lines[lines.length - 1]?.id;
  // Newest at the bottom, in view (scrolling the list only, never the page).
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [last]);
  if (lines.length === 0) {
    return <p className="px-1 pb-2 text-sm text-on-ink-soft">Nobody nearby has said anything yet. Say hi 👋</p>;
  }
  return (
    <ol ref={list} aria-label="Said nearby" className="flex max-h-[min(30dvh,13rem)] flex-col gap-1.5 overflow-y-auto overscroll-contain px-1 pb-2">
      {lines.map((line) => (
        <li key={line.id} className="text-sm leading-snug text-on-ink">
          <Speaker line={line} /> <span className="break-words">{line.text}</span>{' '}
          <span className="text-2xs text-on-ink-soft">· {agoLabel(line.heardAt, now)}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * While the Talk box is closed: the last few lines, briefly, in case you looked away from the bubble (read-only, taps
 * go through to the world).
 */
export function NearbyFeed({ lines }: { readonly lines: readonly HeardLine[] }) {
  const now = useNow(1_000);
  const fresh = lines.filter((line) => now - line.heardAt < FEED_MS).slice(-FEED_MAX_LINES);
  if (fresh.length === 0) return null;
  return (
    <div aria-hidden data-testid="nearby-feed" className="pointer-events-none flex max-w-[min(58vw,22rem)] flex-col items-start gap-1">
      {fresh.map((line) => (
        <p
          key={line.id}
          className={cn(
            'rounded-card bg-ink/70 px-2.5 py-1 text-xs leading-snug text-on-ink shadow-[var(--shadow-glass)] transition-opacity duration-700',
            now - line.heardAt > FEED_MS - 2_000 && 'opacity-0',
          )}
        >
          <Speaker line={line} /> <span className="break-words">{line.text}</span>
        </p>
      ))}
    </div>
  );
}

/** Screen readers hear what others say nearby, politely (your own lines aren't read back). */
export function NearbyAnnouncer({ lines }: { readonly lines: readonly HeardLine[] }) {
  const others = lines.filter((line) => !line.mine).slice(-5);
  return (
    <div role="log" aria-live="polite" aria-relevant="additions" aria-label="Said nearby" className="sr-only">
      {others.map((line) => (
        <p key={line.id}>
          {line.firstName} (@{line.handle}) says: {line.text}
        </p>
      ))}
    </div>
  );
}
