'use client';

import type { ReactNode } from 'react';
import type { BetSlipStatus, BettingClubDto } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';
import { formatOdds } from '../services/betting-format';

/** A club's badge: its two colours split on the diagonal with the three-letter code. */
export function ClubBadge({ club, size = 30 }: { readonly club: BettingClubDto | undefined; readonly size?: number }) {
  const [main, trim] = club?.colors ?? ['#4b6470', '#ffffff'];
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-display text-[0.62rem] font-black leading-none tracking-tight ring-1 ring-black/15"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${main} 0 58%, ${trim} 58% 100%)`, color: '#fff', textShadow: '0 1px 1px rgb(0 0 0 / 0.55)' }}
    >
      {club?.code ?? '?'}
    </span>
  );
}

/** One price on the board. Pressed = on your slip. */
export function OddsButton({
  short,
  odds,
  selected,
  label,
  onPress,
}: {
  readonly short: string;
  readonly odds: number | null;
  readonly selected: boolean;
  /** Spoken: "Enyimba to win, odds 2.12". */
  readonly label: string;
  readonly onPress: () => void;
}) {
  const off = odds === null;
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={off ? `${label}: off the board` : `${label}, odds ${formatOdds(odds)}`}
      disabled={off}
      onClick={onPress}
      className={cn(
        'flex min-h-11 flex-1 flex-col items-center justify-center rounded-chip px-1 py-1 transition-[background-color,transform] duration-100 active:translate-y-px',
        selected ? 'bg-danfo text-ink shadow-[0_2px_0_var(--color-danfo-deep)]' : 'bg-paper-2 text-text ring-1 ring-line hover:bg-pitch-soft',
        off && 'cursor-not-allowed opacity-45',
      )}
    >
      <span className={cn('text-2xs font-bold uppercase', selected ? 'text-ink/75' : 'text-text-soft')}>{short}</span>
      <span className="tabular text-sm font-black">{formatOdds(odds)}</span>
    </button>
  );
}

const STATUS_STYLES: Readonly<Record<BetSlipStatus, string>> = {
  open: 'bg-cobalt-soft text-cobalt',
  won: 'bg-naira-soft text-naira',
  lost: 'bg-okada-soft text-okada',
};

const STATUS_LABELS: Readonly<Record<BetSlipStatus, string>> = { open: 'Open', won: 'Won', lost: 'Lost' };

export function StatusPill({ status }: { readonly status: BetSlipStatus }) {
  return <span className={cn('rounded-full px-2 py-0.5 text-2xs font-black uppercase tracking-wide', STATUS_STYLES[status])}>{STATUS_LABELS[status]}</span>;
}

/** The small print on every screen where money is staked. */
export function GameNairaNote({ className, children }: { readonly className?: string; readonly children?: ReactNode }) {
  return (
    <p className={cn('text-2xs text-text-soft', className)}>
      {children ?? 'Game naira only — no cash value, nothing here can be withdrawn or paid out in real money. 18+.'}
    </p>
  );
}
