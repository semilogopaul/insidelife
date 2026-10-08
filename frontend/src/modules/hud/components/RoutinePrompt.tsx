'use client';

import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import { Briefcase, GraduationCap, Navigation } from 'lucide-react';
import { formatClock12, formatNaira, type GameMinute, type SuggestionDto } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { Button } from '@/common/components';
import { useSuggestionRunner } from '../hooks/use-suggestions';
import { hudApi } from '../services/hud.api';
import { scheduleStart } from '../services/suggestions';

/**
 * "Work starts 8:00 AM at Marina — Drive / Take Bolt / Skip". Shown when work or lectures start within a game hour
 * and you're free. Skipping is allowed (the boss will notice).
 */
export function RoutinePrompt({ suggestion, now, onSkip }: { readonly suggestion: SuggestionDto; readonly now: GameMinute; readonly onSkip: () => void }) {
  const target = suggestion.target;
  const start = scheduleStart(suggestion);
  const reduceMotion = useReducedMotion();
  const { run, busy } = useSuggestionRunner();
  const quotes = useQuery({
    queryKey: queryKeys.domain('hud', 'quotes', target?.locationId ?? ''),
    queryFn: () => hudApi.quotes(target?.locationId ?? ''),
    enabled: target !== null,
    staleTime: 60_000,
  });
  if (!target || start === null) return null;

  const work = suggestion.schedule?.kind === 'work';
  const Icon = work ? Briefcase : GraduationCap;
  const what = work ? 'Work' : 'Lectures';
  const late = now >= start;
  const bolt = quotes.data?.find((quote) => quote.mode === 'bolt' && quote.available) ?? null;

  return (
    <motion.section
      aria-label={`${what} reminder`}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-card bg-danfo text-ink shadow-[var(--shadow-glass)]"
    >
      <div className="flex items-start gap-3 px-3.5 pb-3 pt-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-danfo">
          <Icon size={20} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="type-title text-lg leading-tight">
            {late ? `You’re late — ${what.toLowerCase()} started ${formatClock12(start)}` : `${what} starts ${formatClock12(start)} at ${target.name}`}
          </p>
          <p className="mt-0.5 text-sm font-bold opacity-80">{suggestion.body}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="ink"
              icon={<Navigation size={15} aria-hidden />}
              disabled={busy}
              onClick={() => run({ kind: 'directions', label: 'Directions', locationId: target.locationId, name: target.name })}
            >
              {target.mode === 'car' ? 'Drive (GPS)' : 'Go (GPS)'}
            </Button>
            {bolt && (
              <Button
                size="sm"
                variant="paper"
                disabled={busy}
                onClick={() => run({ kind: 'ride', label: 'Take Bolt', locationId: target.locationId, mode: 'bolt', fare: bolt.fare })}
              >
                Take Bolt {formatNaira(bolt.fare)}
              </Button>
            )}
            <Button size="sm" variant="ghost" className="hover:bg-ink/10" onClick={onSkip}>
              Skip{work ? ' (boss will notice)' : ''}
            </Button>
          </div>
        </div>
      </div>
      <span aria-hidden className="block h-[9px] danfo-stripes" />
    </motion.section>
  );
}
