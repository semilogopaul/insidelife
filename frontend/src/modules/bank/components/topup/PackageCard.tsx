import type { TopupPackage } from '@insidelife/shared';
import { Money } from '@/common/components';
import { cn } from '@/common/utils/cn';

export interface PackageCardProps {
  readonly pack: TopupPackage;
  readonly selected: boolean;
  readonly disabledReason: string | null;
  readonly onSelect: () => void;
}

/** In-game naira you get (big) and the real naira you pay (on the price tag). */
export function PackageCard({ pack, selected, disabledReason, onSelect }: PackageCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabledReason !== null}
      aria-pressed={selected}
      className={cn(
        'relative flex h-full w-full flex-col items-start gap-1 rounded-sheet p-3.5 text-left ring-2 transition-[box-shadow,background-color]',
        selected ? 'bg-danfo-soft ring-danfo' : 'bg-paper-2 ring-transparent hover:bg-paper-3',
        'disabled:cursor-not-allowed disabled:opacity-55',
      )}
    >
      <span className="text-sm font-bold">{pack.label}</span>
      <span className="type-figure text-2xl leading-tight">
        <Money amount={pack.virtualAmount} compact />
      </span>
      <span className="line-clamp-2 text-xs text-text-soft">{pack.blurb}</span>
      <span className="mt-auto inline-flex items-center gap-1 rounded-chip bg-ink px-2 py-1 text-xs font-bold text-on-ink">
        Pay <Money amount={pack.priceNgn} />
      </span>
      {disabledReason && <span className="text-2xs font-bold text-okada">{disabledReason}</span>}
    </button>
  );
}
