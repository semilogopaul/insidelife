'use client';

import { AnimatePresence, motion } from 'motion/react';
import { Target, Trophy } from 'lucide-react';
import { useEffect } from 'react';
import { gameEvents } from '@/common/game/game-events';
import { useMediaQuery } from '@/common/hooks/use-media-query';
import { useCelebrations, type BadgeCelebration } from '../hooks/use-celebration-store';
import { Confetti } from './Confetti';

const SHOW_MS = 4_500;

/**
 * Toast-level celebration: a medal pops in with a small confetti burst, then gets out of the way. Upper-centre on wide
 * screens; on phones the HUD stacks the clock, vitals and minimap down the top third, so it rises from above the thumbs.
 */
export function BadgeBurst() {
  const badge = useCelebrations((state) => state.badges[0] ?? null);
  const dismiss = useCelebrations((state) => state.dismissBadge);

  useEffect(() => {
    if (!badge) return;
    gameEvents.emit('sfx', { id: 'level-up' });
    const id = window.setTimeout(() => dismiss(badge.key), SHOW_MS);
    return () => window.clearTimeout(id);
  }, [badge, dismiss]);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[24%] z-[65] flex justify-center px-4 md:bottom-auto md:top-[18%]">
      <AnimatePresence>{badge && <Medal key={badge.key} badge={badge} onDismiss={() => dismiss(badge.key)} />}</AnimatePresence>
    </div>
  );
}

function Medal({ badge, onDismiss }: { readonly badge: BadgeCelebration; readonly onDismiss: () => void }) {
  const Icon = badge.kind === 'goal' ? Target : Trophy;
  const wide = useMediaQuery('(min-width: 768px)');
  return (
    <>
      <Confetti burstKey={badge.key} intensity="small" origin={{ x: 0.5, y: wide ? 0.22 : 0.72 }} />
      <motion.button
        type="button"
        onClick={onDismiss}
        initial={{ scale: 0.6, opacity: 0, y: -12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: -8 }}
        transition={{ type: 'spring', stiffness: 420, damping: 22 }}
        className="glass pointer-events-auto flex max-w-sm items-center gap-3 rounded-full py-2 pl-2 pr-5 text-left text-on-ink ring-1 ring-danfo/50"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-danfo text-ink shadow-[0_0_0_4px_rgb(246_185_11/0.25)]">
          <Icon size={24} aria-hidden strokeWidth={2.4} />
        </span>
        <span className="min-w-0">
          <span className="block text-2xs font-bold text-danfo">{badge.kind === 'goal' ? 'Life Goal' : 'Unlocked'}</span>
          <span className="block truncate font-bold leading-tight">{badge.title}</span>
          {badge.body && <span className="block truncate text-xs text-on-ink-soft">{badge.body}</span>}
        </span>
      </motion.button>
    </>
  );
}
