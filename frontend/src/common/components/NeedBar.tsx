import { Bath, Battery, PartyPopper, UsersRound, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import type { NeedKey } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';

const NEED_META: Record<NeedKey, { readonly label: string; readonly icon: LucideIcon; readonly color: string }> = {
  energy: { label: 'Energy', icon: Battery, color: 'var(--color-need-energy)' },
  hunger: { label: 'Hunger', icon: UtensilsCrossed, color: 'var(--color-need-hunger)' },
  hygiene: { label: 'Hygiene', icon: Bath, color: 'var(--color-need-hygiene)' },
  fun: { label: 'Fun', icon: PartyPopper, color: 'var(--color-need-fun)' },
  social: { label: 'Social', icon: UsersRound, color: 'var(--color-need-social)' },
};

export interface NeedBarProps {
  readonly need: NeedKey;
  readonly value: number;
  readonly compact?: boolean;
}

/** One need: icon + bar + value. Low values pulse red so colour is never the only signal. */
export function NeedBar({ need, value, compact = false }: NeedBarProps) {
  const meta = NEED_META[need];
  const Icon = meta.icon;
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const critical = pct < 20;
  return (
    <div className="flex items-center gap-2" role="meter" aria-label={meta.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <Icon aria-hidden size={compact ? 14 : 16} className={cn('shrink-0', critical ? 'text-okada animate-pulse' : 'text-on-ink-soft')} />
      <div className={cn('relative overflow-hidden rounded-full bg-white/12', compact ? 'h-1.5 w-16' : 'h-2 w-24')}>
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%`, background: critical ? 'var(--color-okada)' : meta.color }}
        />
      </div>
      {!compact && <span className="tabular w-7 text-right text-xs text-on-ink-soft">{pct}</span>}
    </div>
  );
}

export { NEED_META };
