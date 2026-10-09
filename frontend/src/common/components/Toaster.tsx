'use client';

import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/common/utils/cn';
import { Money } from './Money';
import { useToasts } from './toast-store';

/** Notification stack, top-centre, styled like a phone's alert banner ("Alert! ₦20,000 from @tolu"). */
export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),0.5rem)] z-[60] flex flex-col items-center gap-2 px-3">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            type="button"
            layout
            initial={{ y: -24, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 36 }}
            onClick={() => {
              t.onOpen?.();
              dismiss(t.id);
            }}
            className="glass pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card px-4 py-3 text-left text-on-ink"
          >
            <span
              aria-hidden
              className={cn('mt-1 size-2.5 shrink-0 rounded-full', t.tone === 'good' ? 'bg-naira' : t.tone === 'bad' ? 'bg-okada' : 'bg-danfo')}
            />
            <span className="min-w-0 flex-1">
              <span className="block font-bold leading-snug">{t.title}</span>
              {t.body && <span className="mt-0.5 block text-sm text-on-ink-soft">{t.body}</span>}
            </span>
            {t.amount !== undefined && <Money amount={t.amount} compact signed className="type-figure text-sm" />}
            {t.actionLabel && <span className="mt-0.5 shrink-0 rounded-chip bg-danfo px-2.5 py-1 text-xs font-bold text-ink">{t.actionLabel}</span>}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
