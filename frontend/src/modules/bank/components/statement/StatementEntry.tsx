import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { formatClock12, type LedgerEntryDto } from '@insidelife/shared';
import { Money } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { entryKindLabel } from '../../services/statement';
import { LEDGER_ICONS } from './ledger-icons';

/** One statement line: kind icon (with an in/out arrow so colour is never the only cue), memo, time, signed amount. */
export function StatementEntry({ entry }: { readonly entry: LedgerEntryDto }) {
  const Icon = LEDGER_ICONS[entry.kind];
  const incoming = entry.amount > 0;
  const Direction = incoming ? ArrowDownLeft : ArrowUpRight;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className={cn('relative grid size-10 shrink-0 place-items-center rounded-full', incoming ? 'bg-naira-soft text-naira' : 'bg-paper-2 text-text-soft')}>
        <Icon size={18} aria-hidden />
        <span className={cn('absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full ring-2 ring-paper', incoming ? 'bg-naira text-white' : 'bg-okada text-white')}>
          <Direction size={10} strokeWidth={3} aria-hidden />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 font-bold leading-snug [overflow-wrap:anywhere]">{entry.memo}</span>
        <span className="block truncate text-xs text-text-soft">
          {entryKindLabel(entry)}
          {entry.counterparty ? ` · ${entry.counterparty}` : ''} · {formatClock12(entry.gameMinute)}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="sr-only">{incoming ? 'Money in' : 'Money out'}: </span>
        <Money amount={entry.amount} signed className="type-figure block text-sm" />
        <span className="block text-2xs text-text-faint">
          Bal. <Money amount={entry.balanceAfter} compact />
        </span>
      </span>
    </li>
  );
}
