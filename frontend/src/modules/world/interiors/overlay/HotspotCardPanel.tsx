'use client';

import { Target, X } from 'lucide-react';
import { useEffect } from 'react';
import { formatGameDuration } from '@insidelife/shared';
import { gameEvents } from '@/common/game/game-events';
import { isTypingTarget } from '../../play/input/controls';
import { cn } from '@/common/utils/cn';
import type { HotspotEntryCard } from '../hotspots/hotspots';
import { useHomeView } from '../walk/home-view-store';

/** Keys that choose a card entry (its first duration). */
const ENTRY_KEYS: readonly string[] = [
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
  'Digit8',
  'Digit9',
];

/** "₦18,000 · 2h or 3h · Fun ↑ Social ↑ Energy ↓" */
function metaLine(entry: HotspotEntryCard): string {
  const parts: string[] = [];
  if (entry.priceNote) parts.push(entry.priceNote);
  else if (!entry.opens) parts.push('Free');
  if (entry.durations.length > 0) parts.push(entry.durations.map(formatGameDuration).join(' or '));
  if (entry.effects.length > 0) parts.push(entry.effects.join(' '));
  return parts.join(' · ');
}

/**
 * A thing's card, opened by tapping it in 3D, tapping its marker, or Enter when you're at it: its name, the life goal
 * it serves, and each thing to do there — price, time, what it does to you, or why it can't be done now — with one
 * tap to start (a duration) or open (a service). Esc or ✕ closes; 1–9 choose.
 */
export function HotspotCardPanel({ run }: { readonly run: (entryId: string, minutes?: number) => boolean }) {
  const card = useHomeView(
    (state) => state.hotspots.find((hotspot) => hotspot.id === state.selected) ?? null,
  );
  const close = (): void => useHomeView.getState().select(null);
  const choose = (entry: HotspotEntryCard, minutes?: number): void => {
    if (run(entry.id, minutes)) close();
  };

  useEffect(() => {
    if (!card) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      const index = ENTRY_KEYS.indexOf(event.code);
      const entry = index >= 0 ? card.entries[index] : undefined;
      if (!entry || event.repeat) return;
      event.preventDefault();
      choose(entry, entry.durations[0]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!card) return null;
  return (
    <section
      role="dialog"
      aria-label={`${card.name}: things to do`}
      data-testid="hotspot-card"
      className="glass pointer-events-auto absolute inset-x-3 bottom-[max(env(safe-area-inset-bottom),0.75rem)] z-40 mx-auto max-w-md rounded-sheet text-on-ink sm:bottom-24"
    >
      <header className="flex items-center gap-3 px-4 pb-2 pt-3">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-xl"
        >
          {card.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="type-title block truncate text-lg leading-tight">{card.name}</span>
          <span className="block text-xs text-on-ink-soft">
            {card.count === 1 ? 'One thing to do here' : `${card.count} things to do here`}
          </span>
        </span>
        <button
          type="button"
          onClick={() => {
            gameEvents.emit('sfx', { id: 'ui-close' });
            close();
          }}
          aria-label="Close"
          className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-white/10"
        >
          <X size={20} aria-hidden />
        </button>
      </header>
      {card.goal && (
        <p className="mx-3 mb-2 flex items-center gap-2 rounded-card bg-danfo px-3 py-2 text-sm font-bold text-ink">
          <Target size={16} aria-hidden className="shrink-0" />
          For your goal: {card.goal}
        </p>
      )}
      <ul className="flex max-h-[48dvh] flex-col gap-1.5 overflow-y-auto px-3 pb-3">
        {card.entries.map((entry, index) => (
          <li
            key={entry.id}
            className={cn('rounded-card bg-white/6 p-3', entry.goal && 'ring-2 ring-danfo')}
            data-entry={entry.id}
          >
            <div className="flex items-start gap-2.5">
              <span aria-hidden className="text-2xl leading-none">
                {entry.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-bold leading-tight">
                  {entry.label}
                  {index < ENTRY_KEYS.length && (
                    <kbd className="rounded bg-white/15 px-1.5 text-2xs font-normal pointer-coarse:hidden">
                      {index + 1}
                    </kbd>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-on-ink-soft">{entry.blurb}</span>
                <span className="mt-1 block text-xs font-bold text-on-ink">{metaLine(entry)}</span>
                {entry.disabled && (
                  <span className="mt-1 block text-xs font-bold text-danfo">{entry.disabled}</span>
                )}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {entry.opens ? (
                <button
                  type="button"
                  onClick={() => choose(entry)}
                  className="h-9 rounded-chip bg-danfo px-3 text-sm font-bold text-ink"
                >
                  {entry.opens}
                </button>
              ) : (
                entry.durations.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    aria-disabled={entry.disabled ? true : undefined}
                    onClick={() => choose(entry, minutes)}
                    className={cn(
                      'h-9 rounded-chip px-3 text-sm font-bold',
                      entry.disabled ? 'bg-white/10 text-on-ink-soft' : 'bg-danfo text-ink',
                    )}
                  >
                    {entry.durations.length > 1 || !entry.priceNote
                      ? formatGameDuration(minutes)
                      : `Start · ${formatGameDuration(minutes)}`}
                  </button>
                ))
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
