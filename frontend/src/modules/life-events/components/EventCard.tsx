'use client';

import { Clock } from 'lucide-react';
import { formatGameDuration, type LifeEventDto } from '@insidelife/shared';
import { Spinner } from '@/common/components';
import { useGameMinute } from '@/common/game/use-game-clock';
import { cn } from '@/common/utils/cn';

const URGENT_MINUTES = 60;

export interface EventCardProps {
  readonly event: LifeEventDto;
  /** The choice being submitted, if any. */
  readonly pendingChoiceId: string | null;
  readonly onChoose: (choiceId: string) => void;
  readonly onLater: () => void;
}

/** The decision itself: art, story, a live countdown and the choices (with hints and why some are off). */
export function EventCard({ event, pendingChoiceId, onChoose, onLater }: EventCardProps) {
  const minute = useGameMinute(1_000);
  const timeLeft = Math.max(0, event.expiresAt - minute);
  const urgent = timeLeft < URGENT_MINUTES;
  const busy = pendingChoiceId !== null;

  return (
    <div className="flex flex-col gap-4 pt-1">
      <div className="flex gap-3.5">
        <span aria-hidden className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-card bg-danfo text-4xl">
          {event.art}
          <span className="absolute inset-x-0 bottom-1 h-[9px] danfo-stripes" />
        </span>
        <p className="text-pretty leading-relaxed text-on-ink">{event.body}</p>
      </div>

      <p className={cn('flex items-center gap-1.5 text-sm font-bold', urgent ? 'text-okada' : 'text-on-ink-soft')} aria-live="off">
        <Clock size={15} aria-hidden className={urgent ? 'animate-pulse' : undefined} />
        <span className="tabular">{timeLeft > 0 ? `Decide within ${formatGameDuration(timeLeft)}` : 'Time’s up — deciding for you'}</span>
      </p>

      <ul className="flex flex-col gap-2" aria-label="Your choices">
        {event.choices.map((choice) => {
          const disabled = choice.disabled === true || busy;
          return (
            <li key={choice.id}>
              <button
                type="button"
                disabled={disabled}
                aria-describedby={choice.disabledReason ? `${event.id}-${choice.id}-why` : undefined}
                onClick={() => onChoose(choice.id)}
                className={cn(
                  'flex min-h-13 w-full items-center gap-3 rounded-card px-4 py-3 text-left transition-[transform,background-color] duration-150',
                  choice.disabled ? 'cursor-not-allowed bg-white/5 text-on-ink-soft ring-1 ring-white/10' : 'bg-paper text-ink hover:bg-danfo-soft active:translate-y-px disabled:opacity-60',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-bold leading-snug">{choice.label}</span>
                  {choice.disabledReason && (
                    <span id={`${event.id}-${choice.id}-why`} className="mt-0.5 block text-sm text-[#ff9f8f]">
                      {choice.disabledReason}
                    </span>
                  )}
                </span>
                {pendingChoiceId === choice.id ? (
                  <Spinner />
                ) : (
                  choice.hint &&
                  !choice.disabled && <span className="shrink-0 rounded-chip bg-paper-2 px-2 py-1 text-xs font-bold text-text-soft">{choice.hint}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <button type="button" onClick={onLater} disabled={busy} className="self-center px-3 py-2 text-sm font-bold text-on-ink-soft hover:text-on-ink">
        Decide later
      </button>
    </div>
  );
}
