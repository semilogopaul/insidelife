'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { PackageOpen } from 'lucide-react';
import type { DailyWelcomeResultDto, DailyWelcomeStatusDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, Money, toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useClaimDailyWelcome } from '../hooks/use-goals';

function untilReset(iso: string): string {
  const hours = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 3_600_000));
  return hours <= 1 ? 'in about an hour' : `in about ${hours} hours`;
}

/**
 * Once per real day, a little something from home (mood + small cash). Never a streak: missing a day costs nothing,
 * and the copy never guilt-trips.
 */
export function DailyWelcomeCard({ status }: { readonly status: DailyWelcomeStatusDto }) {
  const claim = useClaimDailyWelcome();
  const reduceMotion = useReducedMotion();
  const result: DailyWelcomeResultDto | undefined = claim.data;

  if (status.claimedToday && !result) {
    return (
      <p className="rounded-card bg-paper-2 px-3.5 py-2.5 text-sm text-text-soft">
        Today’s welcome from home is in your pocket. Another one lands {untilReset(status.nextResetAt)} — whenever you’re around.
      </p>
    );
  }

  return (
    <section aria-label="Welcome from home" className="overflow-hidden rounded-card bg-danfo-soft ring-1 ring-danfo/60">
      <AnimatePresence mode="wait" initial={false}>
        {result ? (
          <motion.div
            key="revealed"
            initial={reduceMotion ? { opacity: 0 } : { rotateX: 90, opacity: 0 }}
            animate={{ rotateX: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 20 }}
            className="flex items-start gap-3 p-3.5"
            aria-live="polite"
          >
            <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-card bg-paper text-3xl shadow-[var(--shadow-lift)]">
              {result.flavour.emoji}
            </span>
            <div className="min-w-0">
              <p className="type-title text-lg leading-tight">{result.flavour.title}</p>
              <p className="mt-0.5 text-sm text-text-soft">{result.flavour.body}</p>
              <p className="mt-1.5 flex flex-wrap gap-x-3 text-sm font-bold">
                {result.cash > 0 && (
                  <span className="text-naira">
                    <Money amount={result.cash} signed />
                  </span>
                )}
                {result.mood && <span className="text-ankara">+{result.mood.value} mood</span>}
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div key="parcel" exit={reduceMotion ? { opacity: 0 } : { rotateX: -90, opacity: 0 }} transition={{ duration: 0.18 }} className="flex items-center gap-3 p-3.5">
            <span className="grid size-14 shrink-0 place-items-center rounded-card bg-danfo text-ink">
              <PackageOpen size={28} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="type-title text-lg leading-tight">Something from home</p>
              <p className="text-sm text-text-soft">Family sent a little something today.</p>
            </div>
            <Button
              loading={claim.isPending}
              onClick={() =>
                claim.mutate(undefined, {
                  onSuccess: (dto) => {
                    gameEvents.emit('sfx', { id: dto.cash > 0 ? 'cash-in' : 'ui-success' });
                  },
                  onError: (error) => toast({ title: 'Couldn’t open it', body: errorMessage(error), tone: 'bad' }),
                })
              }
            >
              Open it
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
