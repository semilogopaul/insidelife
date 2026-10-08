'use client';

import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { BACKGROUNDS, STARTER_FUND, createRng, formatNaira, type BackgroundId } from '@insidelife/shared';
import { Button } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { BACKGROUND_TONE, LOTTERY_ORDER, backgroundFacts } from '../lib/background-facts';

export type LotteryStatus = 'shuffling' | 'revealed';

export interface BirthLotteryProps {
  readonly status: LotteryStatus;
  /** The background fate picked (known once the server answers). */
  readonly background: BackgroundId | null;
  readonly reducedMotion: boolean;
  readonly onEnter: () => void;
}

const SHUFFLE_STEP_MS = 300;

/**
 * Four face-down cards shuffle while the server rolls the birth lottery; then the winning card flips to show who
 * you were born as and what it means. Reduced motion: no shuffle, a calm fade.
 */
export function BirthLottery({ status, background, reducedMotion, onEnter }: BirthLotteryProps) {
  const [order, setOrder] = useState<readonly number[]>([0, 1, 2, 3]);
  const tick = useRef(0);
  const spacing = useCardSpacing();

  useEffect(() => {
    if (status !== 'shuffling' || reducedMotion) return;
    const id = window.setInterval(() => {
      tick.current += 1;
      setOrder(createRng(`lottery-shuffle:${tick.current}`).shuffle([0, 1, 2, 3]));
    }, SHUFFLE_STEP_MS);
    return () => window.clearInterval(id);
  }, [status, reducedMotion]);

  const revealed = status === 'revealed' && background !== null;
  const definition = background ? BACKGROUNDS[background] : null;
  const facts = useMemo(() => (definition ? backgroundFacts(definition) : []), [definition]);
  const enterRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!revealed) return;
    const id = window.setTimeout(() => enterRef.current?.focus(), reducedMotion ? 0 : 1100);
    return () => window.clearTimeout(id);
  }, [revealed, reducedMotion]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto bg-ink px-5 pb-10 pt-[max(env(safe-area-inset-top),2rem)] text-on-ink" role="dialog" aria-modal="true" aria-labelledby="lottery-title">
      <div aria-hidden className="pointer-events-none fixed inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_center,#f6b90b_2px,transparent_2.5px)] [background-size:22px_22px]" />
      <p id="lottery-title" className="relative mt-4 text-center text-on-ink-soft">
        {revealed ? 'Fate has spoken. You were born…' : 'Fate is shuffling. Hold your breath…'}
      </p>

      <div className="relative mt-8 h-[260px] w-full max-w-[640px] [perspective:1200px] sm:h-[300px]" aria-hidden>
        {LOTTERY_ORDER.map((id, index) => {
          const slot = order.indexOf(index);
          const winner = revealed && id === background;
          const spread = slot - 1.5;
          const animate = revealed
            ? winner
              ? { x: 0, y: 0, rotate: 0, rotateY: 180, scale: 1.18, opacity: 1, zIndex: 10 }
              : { x: spread * 70, y: 70, rotate: spread * 6, rotateY: 0, scale: 0.86, opacity: 0, zIndex: 0 }
            : { x: spread * spacing, y: Math.abs(spread) * 10, rotate: spread * 5, rotateY: 0, scale: 1, opacity: 1, zIndex: slot };
          return (
            <motion.div
              key={id}
              className="absolute left-1/2 top-1/2 -ml-[66px] -mt-[94px] h-[188px] w-[132px] sm:-ml-[76px] sm:-mt-[108px] sm:h-[216px] sm:w-[152px]"
              style={{ transformStyle: 'preserve-3d' }}
              initial={false}
              animate={animate}
              transition={reducedMotion ? { duration: 0.25 } : revealed && winner ? { type: 'spring', stiffness: 120, damping: 16, delay: 0.25 } : { type: 'spring', stiffness: 260, damping: 22 }}
            >
              <CardBack />
              <CardFront id={id} />
            </motion.div>
          );
        })}
      </div>

      <div aria-live="polite" className="relative w-full max-w-md">
        {revealed && definition && (
          <motion.div initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reducedMotion ? 0 : 0.9, duration: 0.4 }} className="mt-6 flex flex-col gap-5">
            <div>
              <h2 className="type-slogan text-6xl uppercase text-danfo sm:text-7xl">{definition.label}</h2>
              <p className="mt-2 text-lg text-on-ink">{definition.blurb}</p>
            </div>
            <dl className="grid grid-cols-2 gap-2">
              {facts.map((fact) => (
                <div key={fact.label} className="rounded-card bg-white/[0.07] p-3 ring-1 ring-white/10">
                  <dt className="text-xs text-on-ink-soft">{fact.label}</dt>
                  <dd className="mt-0.5 font-bold leading-snug">{fact.value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-on-ink-soft">
              Uncle Tunde in Houston also sent <span className="font-bold text-naira-soft">{formatNaira(STARTER_FUND)}</span> to help you start. Buy motor, no waste am.
            </p>
            <Button ref={enterRef} size="lg" block onClick={onEnter}>
              Enter Lagos
            </Button>
          </motion.div>
        )}
        {!revealed && <p className="sr-only">Shuffling the cards</p>}
      </div>
    </div>
  );
}

/** Horizontal distance between card centres: wide on desktop, overlapping on phones. */
function subscribeResize(callback: () => void): () => void {
  window.addEventListener('resize', callback);
  return () => window.removeEventListener('resize', callback);
}

function useCardSpacing(): number {
  const width = useSyncExternalStore(subscribeResize, () => window.innerWidth, () => 1024);
  return Math.min(160, width * 0.21);
}

function CardBack() {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-[18px] bg-ink-2 shadow-glass ring-2 ring-danfo [backface-visibility:hidden]">
      <div className="absolute inset-0 opacity-30 [background-image:repeating-linear-gradient(45deg,#f6b90b_0_6px,transparent_6px_18px)]" />
      <div className="danfo-stripes absolute inset-x-0 top-6 h-[9px]" style={{ filter: 'invert(1)' }} />
      <div className="absolute inset-0 grid place-items-center">
        <span className="type-slogan grid size-16 place-items-center rounded-full bg-danfo text-5xl text-ink">?</span>
      </div>
    </div>
  );
}

function CardFront({ id }: { readonly id: BackgroundId }) {
  const definition = BACKGROUNDS[id];
  const tone = BACKGROUND_TONE[id];
  return (
    <div className={cn('absolute inset-0 flex flex-col justify-between rounded-[18px] p-4 shadow-glass [backface-visibility:hidden] [transform:rotateY(180deg)]', tone.card, tone.ink)}>
      <span className={cn('self-start rounded-full px-2 py-0.5 text-[0.7rem] font-bold', tone.chip)}>{definition.weight}% of births</span>
      <span className="type-slogan text-[2.6rem] uppercase leading-[0.85]">{definition.label}</span>
    </div>
  );
}
