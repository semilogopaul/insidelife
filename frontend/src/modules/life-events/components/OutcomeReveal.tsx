'use client';

import { motion, useReducedMotion } from 'motion/react';
import { CircleAlert, PartyPopper, Sparkle } from 'lucide-react';
import type { LifeEventOutcomeDto } from '@insidelife/shared';
import { Button, Money } from '@/common/components';
import { cn } from '@/common/utils/cn';

const TONE = {
  good: { icon: PartyPopper, ring: 'bg-naira text-white', label: 'It went well' },
  bad: { icon: CircleAlert, ring: 'bg-okada text-white', label: 'Wahala' },
  neutral: { icon: Sparkle, ring: 'bg-paper text-ink', label: 'So it goes' },
} as const;

/** The result of a choice, revealed in place: a stamp-like icon, the story and what it cost or paid. */
export function OutcomeReveal({ outcome, moreWaiting, onContinue }: { readonly outcome: LifeEventOutcomeDto; readonly moreWaiting: number; readonly onContinue: () => void }) {
  const reduceMotion = useReducedMotion();
  const tone = TONE[outcome.tone];
  const Icon = tone.icon;
  return (
    <div className="flex flex-col gap-4 pt-1" aria-live="polite">
      <motion.div
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85, filter: 'blur(6px)' }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, filter: 'blur(0px)' }}
        transition={{ type: 'spring', stiffness: 300, damping: 22 }}
        className="flex items-start gap-3.5 rounded-card bg-white/6 p-4 ring-1 ring-white/10"
      >
        <motion.span
          initial={reduceMotion ? false : { rotate: -25, scale: 0.4 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 14, delay: 0.1 }}
          className={cn('grid size-12 shrink-0 place-items-center rounded-full', tone.ring)}
        >
          <Icon size={24} aria-hidden />
        </motion.span>
        <div className="min-w-0">
          <p className="text-2xs font-bold text-on-ink-soft">{tone.label}</p>
          <p className="type-title text-xl leading-tight text-on-ink">{outcome.title}</p>
          <p className="mt-1 text-pretty leading-relaxed text-on-ink-soft">{outcome.body}</p>
        </div>
      </motion.div>
      {outcome.moneyDelta !== 0 && (
        <motion.p
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className={cn('type-figure text-center text-3xl', outcome.moneyDelta > 0 ? 'text-[#5fd39a]' : 'text-[#ff9f8f]')}
        >
          <Money amount={outcome.moneyDelta} signed className="text-current" />
        </motion.p>
      )}
      <Button size="lg" block onClick={onContinue}>
        {moreWaiting > 0 ? `Next decision (${moreWaiting})` : 'Continue'}
      </Button>
    </div>
  );
}
