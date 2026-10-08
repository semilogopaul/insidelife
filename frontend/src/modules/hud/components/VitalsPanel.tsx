'use client';

import { ChevronDown, ChevronUp, HeartPulse } from 'lucide-react';
import { useId, useState } from 'react';
import { moodBand, NEED_KEYS, type Needs } from '@insidelife/shared';
import { NEED_META, NeedBar } from '@/common/components';
import { cn } from '@/common/utils/cn';

const startCollapsed = (): boolean => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;

/**
 * Health + mood + the five needs. Collapsible: on phones it starts as a compact strip (mood + five mini meters, with
 * any critical need flagged) so the world stays visible.
 */
export function VitalsPanel({ needs, mood, health }: { readonly needs: Needs; readonly mood: number; readonly health: number }) {
  const [collapsed, setCollapsed] = useState(startCollapsed);
  const bodyId = useId();
  const band = moodBand(mood);
  const healthPct = Math.round(health);
  const critical = NEED_KEYS.filter((need) => needs[need] < 20);

  return (
    <section aria-label="Your vitals" className="glass w-fit rounded-card">
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
        aria-controls={bodyId}
        className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left"
      >
        <span aria-hidden className="text-lg leading-none">
          {band.emoji}
        </span>
        <span className="text-sm font-bold text-on-ink">{band.label}</span>
        {collapsed && (
          <span className="flex items-end gap-1" aria-hidden>
            {[...NEED_KEYS].map((need) => {
              const value = Math.max(4, Math.min(100, Math.round(needs[need])));
              return (
                <span key={need} className="relative h-4 w-1.5 overflow-hidden rounded-full bg-white/12">
                  <span
                    className="absolute inset-x-0 bottom-0 rounded-full"
                    style={{ height: `${value}%`, background: needs[need] < 20 ? 'var(--color-okada)' : NEED_META[need].color }}
                  />
                </span>
              );
            })}
          </span>
        )}
        {collapsed && critical.length > 0 && (
          <span className="rounded-chip bg-okada px-1.5 py-0.5 text-2xs font-bold text-white">{NEED_META[critical[0]!].label} low</span>
        )}
        {collapsed ? <ChevronDown size={16} aria-hidden className="ml-auto text-on-ink-soft" /> : <ChevronUp size={16} aria-hidden className="ml-auto text-on-ink-soft" />}
        <span className="sr-only">{collapsed ? 'Show needs' : 'Hide needs'}</span>
      </button>
      <div id={bodyId} hidden={collapsed} className="flex flex-col gap-1.5 px-3 pb-2.5">
        <div className="flex items-center gap-2" role="meter" aria-label="Health" aria-valuemin={0} aria-valuemax={100} aria-valuenow={healthPct}>
          <HeartPulse size={16} aria-hidden className={cn('text-okada', healthPct < 35 && 'animate-pulse')} />
          <div className="relative h-2 w-24 overflow-hidden rounded-full bg-white/12">
            <div className="absolute inset-y-0 left-0 rounded-full bg-okada transition-[width] duration-700" style={{ width: `${healthPct}%` }} />
          </div>
          <span className="tabular w-7 text-right text-xs text-on-ink-soft">{healthPct}</span>
        </div>
        {NEED_KEYS.map((need) => (
          <NeedBar key={need} need={need} value={needs[need]} />
        ))}
      </div>
    </section>
  );
}
