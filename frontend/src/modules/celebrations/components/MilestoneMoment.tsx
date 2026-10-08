'use client';

import { motion, useReducedMotion } from 'motion/react';
import { Share2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button, toast } from '@/common/components';
import { useEscapeLayer } from '@/common/hooks/use-escape-layer';
import { shareMoment } from '../services/share';
import type { CelebrationMoment } from '../hooks/use-celebration-store';
import { Confetti } from './Confetti';
import { NamedIcon } from '@/common/components';

export interface MilestoneMomentProps {
  readonly moment: CelebrationMoment;
  /** Position in the queue, e.g. 1 of 3. */
  readonly index: number;
  readonly total: number;
  readonly onClose: () => void;
}

/**
 * The peak-end moment: a full-screen card with the title painted on a danfo panel, the double stripe, stats on
 * plates, confetti and a share button. Escape or Continue closes it.
 */
export function MilestoneMoment({ moment, index, total, onClose }: MilestoneMomentProps) {
  const titleId = useId();
  const bodyId = useId();
  const continueRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    continueRef.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab' || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled])')];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [moment.key]);
  useEscapeLayer(true, onClose);

  const share = async (): Promise<void> => {
    setSharing(true);
    const outcome = await shareMoment(moment.title, moment.shareText ?? `${moment.title} — Inside Life`);
    setSharing(false);
    if (outcome === 'copied') toast({ title: 'Copied', body: 'Paste it in your group chat. Make them jealous small.', tone: 'good' });
    if (outcome === 'failed') toast({ title: 'Couldn’t share that', body: 'Take a screenshot instead — this one deserves it.', tone: 'neutral' });
  };

  const enter = (delay: number) =>
    reduceMotion ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { delay: delay * 0.3 } } : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { delay, type: 'spring' as const, stiffness: 260, damping: 24 } };

  return (
    <motion.div
      className="fixed inset-0 z-[80] overflow-y-auto overflow-x-hidden bg-ink/95 text-on-ink"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-[radial-gradient(70%_45%_at_50%_18%,rgb(246_185_11/0.28),transparent_70%)]" />
      <Confetti burstKey={moment.key} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="relative mx-auto flex min-h-full max-w-xl flex-col items-center justify-center gap-6 px-6 pb-[max(env(safe-area-inset-bottom),2.5rem)] pt-[max(env(safe-area-inset-top),2.5rem)] text-center"
      >
        <motion.span
          {...(reduceMotion ? { initial: { opacity: 0 }, animate: { opacity: 1 } } : { initial: { scale: 0.3, rotate: -40, opacity: 0 }, animate: { scale: 1, rotate: 0, opacity: 1 }, transition: { type: 'spring', stiffness: 320, damping: 16 } })}
          className="grid size-20 place-items-center rounded-full bg-danfo text-ink shadow-[0_0_0_8px_rgb(246_185_11/0.18),0_0_0_18px_rgb(246_185_11/0.07)]"
        >
          <NamedIcon name={moment.icon} size={38} strokeWidth={2.3} aria-hidden />
        </motion.span>

        <motion.div
          {...(reduceMotion
            ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
            : { initial: { x: '-110%', rotate: -2 }, animate: { x: 0, rotate: -2 }, transition: { type: 'spring', stiffness: 170, damping: 20, delay: 0.08 } })}
          className="relative w-[calc(100%+3rem)] max-w-none bg-danfo px-5 pb-6 pt-4 text-ink shadow-[0_18px_40px_rgb(0_0_0/0.35)] sm:w-full sm:rounded-card"
        >
          <h2 id={titleId} className="type-slogan text-balance text-[clamp(3rem,15vw,6.25rem)] uppercase">
            {moment.title}
          </h2>
          <span aria-hidden className="danfo-stripes absolute inset-x-0 bottom-2 h-[9px]" />
        </motion.div>

        <motion.p id={bodyId} {...enter(0.35)} className="max-w-md text-pretty text-lg leading-relaxed text-on-ink">
          {moment.body}
        </motion.p>

        {moment.stats.length > 0 && (
          <motion.dl {...enter(0.5)} className="flex flex-wrap justify-center gap-2">
            {moment.stats.map((stat) => (
              <div key={stat.label} className="min-w-28 rounded-chip bg-white/8 px-3.5 py-2 text-left ring-1 ring-white/15">
                <dt className="text-2xs font-bold text-on-ink-soft">{stat.label}</dt>
                <dd className="type-figure text-lg text-on-ink">{stat.value}</dd>
              </div>
            ))}
          </motion.dl>
        )}

        <motion.div {...enter(0.65)} className="mt-2 flex w-full max-w-sm flex-col gap-2.5 sm:flex-row">
          <Button variant="paper" size="lg" block icon={<Share2 size={20} aria-hidden />} loading={sharing} onClick={() => void share()}>
            Share
          </Button>
          <Button ref={continueRef} variant="danfo" size="lg" block onClick={onClose}>
            {index < total ? 'Next' : 'Continue'}
          </Button>
        </motion.div>
        {total > 1 && (
          <p className="tabular text-xs font-bold text-on-ink-soft">
            {index} of {total} moments
          </p>
        )}
      </div>
    </motion.div>
  );
}
