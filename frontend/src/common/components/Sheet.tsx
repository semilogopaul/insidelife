'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useEscapeLayer } from '@/common/hooks/use-escape-layer';
import { restoreFocus } from '@/common/utils/focus';
import { cn } from '@/common/utils/cn';

export interface SheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly children: ReactNode;
  /** `paper` for menus/forms, `ink` for in-world cards. */
  readonly tone?: 'paper' | 'ink';
  readonly size?: 'sm' | 'md' | 'lg';
  /** Hide the close button (e.g. life events that require a choice). */
  readonly dismissible?: boolean;
  readonly className?: string;
}

const WIDTHS = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-2xl' } as const;

/**
 * Accessible dialog that is a bottom sheet on phones and a centred panel on larger screens. Traps focus, closes on
 * Escape/backdrop (when dismissible) and returns focus to the trigger.
 */
export function Sheet({ open, onClose, title, description, children, tone = 'paper', size = 'md', dismissible = true, className }: SheetProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = (): HTMLElement[] =>
      panel ? [...panel.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.hasAttribute('disabled')) : [];
    (focusables()[0] ?? panel)?.focus();

    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
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
      // Back to the trigger if it's still there, else to the page (where W A S D drive the game again).
      restoreFocus(previous, panel);
    };
  }, [open]);

  useEscapeLayer(open, () => {
    if (dismissible) onClose();
  });

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-ink/55"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismissible ? onClose : undefined}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            className={cn(
              'relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-sheet sm:rounded-sheet',
              WIDTHS[size],
              tone === 'paper' ? 'bg-paper text-text' : 'bg-ink text-on-ink ring-1 ring-white/10',
              className,
            )}
            initial={reduceMotion ? { opacity: 0 } : { y: 48, opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { y: 48, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
          >
            <header className="flex items-start gap-3 px-5 pb-3 pt-5">
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="type-title text-2xl leading-tight">
                  {title}
                </h2>
                {description && (
                  <p id={descriptionId} className={cn('mt-1 text-sm', tone === 'paper' ? 'text-text-soft' : 'text-on-ink-soft')}>
                    {description}
                  </p>
                )}
              </div>
              {dismissible && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className={cn('grid size-10 shrink-0 place-items-center rounded-full', tone === 'paper' ? 'hover:bg-paper-2' : 'hover:bg-white/10')}
                >
                  <X size={20} aria-hidden />
                </button>
              )}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
