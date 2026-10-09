'use client';

import { Clock, Sparkles, TrendingUp } from 'lucide-react';
import type { NightOutItemId, NightOutOfferDto } from '@insidelife/shared';
import { Money } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { durationLabel } from '../../services/night-out';

export interface OfferListProps {
  readonly label: string;
  readonly offers: readonly NightOutOfferDto[];
  readonly selected: NightOutItemId | null;
  readonly cash: number;
  readonly onSelect: (id: NightOutItemId) => void;
}

/**
 * The menu as radio cards: price, what the room sees, how long, clout and what's left tonight. Unavailable items stay
 * selectable so the reason is right there (the buy button explains it too).
 */
export function OfferList({ label, offers, selected, cash, onSelect }: OfferListProps) {
  return (
    <ul role="radiogroup" aria-label={label} className="flex flex-col gap-2">
      {offers.map((offer) => {
        const checked = offer.id === selected;
        const short = offer.unavailable === null && cash < offer.price;
        const chip = checked ? 'bg-white/12 text-on-ink' : 'bg-paper-2 text-text-soft';
        return (
          <li key={offer.id}>
            <button
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={`${offer.label}, ${offer.price.toLocaleString('en-NG')} naira${offer.unavailable ? `. ${offer.unavailable}` : ''}`}
              onClick={() => onSelect(offer.id)}
              className={cn(
                'flex w-full items-start gap-3 rounded-card p-3 text-left ring-1 transition-colors',
                checked ? 'bg-ink text-on-ink ring-ink' : 'bg-paper text-text ring-line hover:bg-paper-3',
              )}
            >
              <span aria-hidden className={cn('grid size-11 shrink-0 place-items-center rounded-[14px] text-2xl', checked ? 'bg-white/10' : 'bg-paper-2')}>
                {offer.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-bold leading-tight">{offer.label}</span>
                  <Money amount={offer.price} className={cn('type-figure shrink-0 text-sm', short && !checked && 'text-okada')} />
                </span>
                <span className={cn('mt-0.5 block text-sm leading-snug', checked ? 'text-on-ink-soft' : 'text-text-soft')}>{offer.blurb}</span>
                <span className="mt-2 flex flex-wrap gap-1.5 text-2xs font-bold">
                  <span className={cn('inline-flex items-center gap-1 rounded-chip px-2 py-0.5', chip)}>
                    <Sparkles size={12} aria-hidden /> {offer.shows}
                  </span>
                  <span className={cn('inline-flex items-center gap-1 rounded-chip px-2 py-0.5', chip)}>
                    <Clock size={12} aria-hidden /> {durationLabel(offer)}
                  </span>
                  {offer.clout > 0 && (
                    <span className={cn('inline-flex items-center gap-1 rounded-chip px-2 py-0.5', chip)}>
                      <TrendingUp size={12} aria-hidden /> +{offer.clout} clout
                    </span>
                  )}
                  <span className={cn('rounded-chip px-2 py-0.5', chip)}>{offer.leftTonight} left tonight</span>
                </span>
                {offer.unavailable && <span className={cn('mt-1.5 block text-xs font-bold', checked ? 'text-[#ffb4a8]' : 'text-okada')}>{offer.unavailable}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
