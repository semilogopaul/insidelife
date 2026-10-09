'use client';

import dynamic from 'next/dynamic';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { SocialMomentDto } from '@insidelife/shared';
import { gameEvents } from '@/common/game/game-events';
import { useSnapshot } from '@/common/game/snapshot';
import { useRealtimeEvent } from '@/common/realtime/use-realtime';

/** three.js is heavy: load the little scene only when a moment happens. */
const MomentScene = dynamic(() => import('./MomentScene').then((module) => module.MomentScene), {
  ssr: false,
});

const SHOW_MS = 5_000;
const HEARTS = [0, 1, 2, 3, 4, 5];

/**
 * Hugs and kisses in 3D: you and them, face to face, for a few seconds with hearts floating up. Opens when you hug or
 * kiss someone (Family app) and when someone in the same place does it to you (realtime). Tap to close.
 */
export function MomentLayer() {
  const [moment, setMoment] = useState<SocialMomentDto | null>(null);
  const { data: snapshot } = useSnapshot();
  const reduceMotion = useReducedMotion();

  useEffect(() => gameEvents.on('social-moment', (next) => setMoment(next)), []);
  useRealtimeEvent('social:moment', (next) => {
    gameEvents.emit('sfx', { id: 'ui-success' });
    setMoment(next);
  });
  useEffect(() => {
    if (!moment) return;
    const id = window.setTimeout(() => setMoment(null), SHOW_MS);
    return () => window.clearTimeout(id);
  }, [moment]);

  const character = snapshot?.character;
  const caption = moment
    ? moment.kind === 'kiss'
      ? `You and ${moment.with.name} 😘`
      : `You and ${moment.with.name} 🤗`
    : '';
  return (
    <AnimatePresence>
      {moment && character && (
        <motion.div
          key="moment"
          role="dialog"
          aria-label={caption}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 grid place-items-center bg-ink/55 p-4"
          onClick={() => setMoment(null)}
        >
          <motion.div
            initial={reduceMotion ? false : { scale: 0.9, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            className="relative w-full max-w-xs overflow-hidden rounded-sheet bg-gradient-to-b from-[#ffe3ea] to-paper shadow-[var(--shadow-lift)]"
          >
            <div className="aspect-[4/5] w-full">
              <MomentScene
                moment={moment}
                me={{ appearance: character.appearance, outfit: character.outfit, gender: character.gender }}
              />
            </div>
            {!reduceMotion && (
              <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                {HEARTS.map((index) => (
                  <motion.span
                    key={index}
                    className="absolute bottom-16 text-2xl"
                    style={{ left: `${14 + index * 14}%` }}
                    initial={{ y: 0, opacity: 0 }}
                    animate={{ y: -260, opacity: [0, 1, 1, 0] }}
                    transition={{ duration: 3.2, delay: 0.4 + index * 0.35, ease: 'easeOut' }}
                  >
                    {moment.kind === 'kiss' ? '❤️' : '💛'}
                  </motion.span>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between gap-2 px-4 pb-4 pt-1">
              <p className="type-title text-xl text-ink">{caption}</p>
              <button
                type="button"
                onClick={() => setMoment(null)}
                className="rounded-chip px-2 py-1 text-sm font-bold text-text-soft hover:bg-paper-2"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
