'use client';

import { motion, useReducedMotion } from 'motion/react';
import { Scale } from 'lucide-react';
import { gameEvents } from '@/common/game/game-events';
import { useSnapshot } from '@/common/game/snapshot';
import { useLifeEventsUi } from '../hooks/use-life-events-ui';

/** HUD chip: "2 decisions waiting" — opens the life-event card. Hidden when nothing is pending. */
export function PendingDecisionsChip() {
  const pending = useSnapshot().data?.pendingEvents ?? 0;
  const setOpen = useLifeEventsUi((state) => state.setOpen);
  const reduceMotion = useReducedMotion();
  if (pending <= 0) return null;
  return (
    <motion.button
      type="button"
      initial={reduceMotion ? false : { scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      onClick={() => {
        gameEvents.emit('sfx', { id: 'ui-open' });
        setOpen(true);
      }}
      className="flex h-10 items-center gap-1.5 rounded-card bg-danfo px-3 text-sm font-bold text-ink shadow-[0_3px_0_var(--color-danfo-deep)] active:translate-y-px"
    >
      <Scale size={16} aria-hidden />
      {pending} decision{pending > 1 ? 's' : ''} waiting
    </motion.button>
  );
}
