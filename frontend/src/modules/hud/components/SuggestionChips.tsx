'use client';

import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, Lightbulb, X } from 'lucide-react';
import { useState } from 'react';
import type { SuggestionDto } from '@insidelife/shared';
import { Button } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { actionLabel, useSuggestionRunner } from '../hooks/use-suggestions';
import { chipLabel, suggestionActions } from '../services/suggestions';
import { NamedIcon } from '@/common/components';

const KIND_TINT: Readonly<Record<SuggestionDto['kind'], string>> = {
  schedule: 'bg-cobalt text-white',
  need: 'bg-okada text-white',
  goal: 'bg-danfo text-ink',
};

/** 1-3 "smart next step" chips above the bottom bar. Tap one for the details and one-tap actions. */
export function SuggestionChips({ suggestions, max }: { readonly suggestions: readonly SuggestionDto[]; readonly max: number }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const { run, busy } = useSuggestionRunner();
  const visible = suggestions.filter((suggestion) => !hidden.has(suggestion.id)).slice(0, max);
  const open = visible.find((suggestion) => suggestion.id === openId) ?? null;

  if (visible.length === 0) return null;
  return (
    <div className="flex max-w-[min(22rem,calc(100vw-7rem))] flex-col items-start gap-1.5" aria-label="Suggestions">
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key={open.id}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ type: 'spring', stiffness: 500, damping: 36 }}
            className="glass w-full rounded-card p-3 text-on-ink"
          >
            <div className="flex items-start gap-2">
              <p className="type-title flex-1 leading-tight">{open.title}</p>
              <button
                type="button"
                onClick={() => {
                  setHidden((current) => new Set(current).add(open.id));
                  setOpenId(null);
                }}
                aria-label="Hide this suggestion"
                className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-full hover:bg-white/10"
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            <p className="mt-1 text-sm leading-snug text-on-ink-soft">{open.body}</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {suggestionActions(open, actionLabel).map((action, index) => (
                <Button key={`${action.kind}-${action.label}`} size="sm" variant={index === 0 ? 'danfo' : 'paper'} disabled={busy} onClick={() => run(action, () => setOpenId(null))}>
                  {action.label}
                </Button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {visible.map((suggestion) => (
        <button
          key={suggestion.id}
          type="button"
          onClick={() => setOpenId((current) => (current === suggestion.id ? null : suggestion.id))}
          aria-expanded={openId === suggestion.id}
          className={cn('glass flex h-10 max-w-full items-center gap-2 rounded-full py-1 pl-1 pr-3 text-left text-sm text-on-ink hover:brightness-110', openId === suggestion.id && 'ring-2 ring-danfo')}
        >
          <span className={cn('grid size-8 shrink-0 place-items-center rounded-full', KIND_TINT[suggestion.kind])}>
            <NamedIcon name={suggestion.icon} fallback={Lightbulb} size={16} aria-hidden />
          </span>
          <span className="truncate font-bold">{chipLabel(suggestion)}</span>
          <ChevronRight size={14} aria-hidden className="shrink-0 text-on-ink-soft" />
        </button>
      ))}
    </div>
  );
}
