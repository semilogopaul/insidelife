'use client';

import { BACKGROUNDS } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';
import { BACKGROUND_TONE, LOTTERY_ORDER } from '../lib/background-facts';

/** Explains the birth lottery and the odds. The button lives in the sheet footer. */
export function FateStep({ error }: { readonly error: string | null }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-text-soft">
        You don’t choose your family. Most Lagosians are born Sapa Pikin; a lucky few are Nepo Babies. Fate shuffles the cards when you press the button, and there are no rerolls.
      </p>
      <ul className="grid grid-cols-2 gap-2 text-sm">
        {LOTTERY_ORDER.map((id) => {
          const background = BACKGROUNDS[id];
          const tone = BACKGROUND_TONE[id];
          return (
            <li key={id} className="flex items-center gap-3 rounded-card bg-paper-2 p-3 ring-1 ring-line">
              <span aria-hidden className={cn('h-9 w-1.5 shrink-0 rounded-full', tone.card)} />
              <span>
                <span className="block font-bold leading-tight">{background.label}</span>
                <span className="text-text-soft">{background.weight}% of births</span>
              </span>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="rounded-card bg-okada-soft px-3.5 py-2.5 text-sm font-bold text-okada">
          {error}
        </p>
      )}
    </div>
  );
}
