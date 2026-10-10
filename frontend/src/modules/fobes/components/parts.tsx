'use client';

import { ArrowDownRight, ArrowUpRight, Sparkles } from 'lucide-react';
import type { FobesEntryDto, FobesMoveDto, FobesWealthMixDto } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';
import { byline, fullName, initials, isRise, mixSummary, moveContext, moveSpoken } from '../services/fobes-format';

/** How a fortune was made, as one thin bar: earned (green), given (gold), bought (blue). Named in words for readers. */
export function MixBar({ mix, tone = 'paper', className }: { readonly mix: FobesWealthMixDto; readonly tone?: 'paper' | 'noir'; readonly className?: string }) {
  return (
    <span
      role="img"
      aria-label={`How they made it: ${mixSummary(mix)}`}
      className={cn('flex h-1.5 w-full overflow-hidden rounded-full', tone === 'noir' ? 'bg-white/15' : 'bg-paper-3', className)}
    >
      <span className="bg-naira" style={{ width: `${mix.selfMadePct}%` }} />
      <span className="bg-gold" style={{ width: `${mix.givenPct}%` }} />
      <span className="bg-cobalt" style={{ width: `${mix.boughtPct}%` }} />
    </span>
  );
}

export function Monogram({ entry, size = 'md' }: { readonly entry: Pick<FobesEntryDto, 'firstName' | 'lastName'>; readonly size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'type-slogan grid shrink-0 place-items-center rounded-full bg-noir text-gold ring-2 ring-gold',
        size === 'lg' ? 'size-20 text-4xl ring-offset-4 ring-offset-noir' : 'size-10 text-lg',
      )}
    >
      {initials(entry)}
    </span>
  );
}

function MoveFigure({ move }: { readonly move: FobesMoveDto }) {
  const rise = isRise(move);
  const Icon = move.newEntry ? Sparkles : rise ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('flex items-center justify-end gap-1 font-bold', move.newEntry ? 'text-gold-ink' : rise ? 'text-naira' : 'text-okada')}>
      <Icon size={15} aria-hidden />
      <span aria-hidden>{move.display}</span>
      <span className="sr-only">{moveSpoken(move)}</span>
    </span>
  );
}

/** The cover star: #1 on the list, magazine-style. Tapping opens their Gist profile. */
export function CoverStory({ entry, listTitle, onOpen }: { readonly entry: FobesEntryDto; readonly listTitle: string; readonly onOpen: (entry: FobesEntryDto) => void }) {
  return (
    <article aria-label={`Cover: number 1 on ${listTitle}`} className="overflow-hidden rounded-card bg-noir text-on-ink shadow-[var(--shadow-lift)]">
      <button type="button" onClick={() => onOpen(entry)} className="flex w-full flex-col gap-3 p-5 text-left focus-visible:outline-offset-[-3px]">
        <span className="border-b border-gold/40 pb-2 text-2xs font-bold uppercase tracking-[0.16em] text-gold">No. 1 · {listTitle}</span>
        <span className="flex items-center gap-4">
          <Monogram entry={entry} size="lg" />
          <span className="min-w-0">
            <span className="type-slogan block text-[2.6rem] uppercase text-white">
              {entry.firstName}
              <br />
              {entry.lastName}
            </span>
            <span className="mt-1 block truncate text-sm text-on-ink-soft">
              @{entry.handle} · {byline(entry)}
              {entry.isYou && ' · you'}
            </span>
          </span>
        </span>
        <span className="flex items-end justify-between gap-3">
          <span>
            <span className="block text-2xs font-bold uppercase tracking-[0.18em] text-on-ink-soft">{entry.move ? 'This week' : 'Worth'}</span>
            <span className="type-figure block text-3xl text-gold">{entry.move ? entry.move.display : entry.worth.display}</span>
          </span>
          <span className="max-w-[45%] text-right text-sm italic text-on-ink-soft">“{entry.mix.label}”</span>
        </span>
        <MixBar mix={entry.mix} tone="noir" />
        <span className="sr-only">Opens their profile.</span>
      </button>
    </article>
  );
}

/** One person on a list. */
export function EntryRow({ entry, onOpen }: { readonly entry: FobesEntryDto; readonly onOpen: (entry: FobesEntryDto) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(entry)}
        aria-current={entry.isYou ? 'true' : undefined}
        className={cn('flex w-full items-center gap-3 border-b border-line px-1 py-3 text-left hover:bg-paper-2', entry.isYou && 'bg-gold-soft')}
      >
        <span className="type-slogan w-11 shrink-0 text-right text-3xl text-gold-ink">
          <span className="sr-only">Rank </span>
          {entry.rank}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">
            {fullName(entry)}
            {entry.isYou && <span className="ml-1.5 text-xs text-gold-ink">(you)</span>}
          </span>
          <span className="block truncate text-xs text-text-soft">
            @{entry.handle} · {byline(entry)}
          </span>
          <MixBar mix={entry.mix} className="mt-1.5 max-w-40" />
        </span>
        <span className="flex shrink-0 flex-col items-end text-right">
          {entry.move ? <MoveFigure move={entry.move} /> : <span className="type-figure text-base">{entry.worth.display}</span>}
          <span className="text-2xs text-text-soft">{entry.move ? `${entry.worth.display} · ${moveContext(entry.move)}` : entry.mix.label}</span>
        </span>
        <span className="sr-only">Opens their profile.</span>
      </button>
    </li>
  );
}
