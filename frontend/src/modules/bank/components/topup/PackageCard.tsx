import { formatNaira, formatUsdCents, topupVirtualAmountUsd, type TopupPackage } from '@insidelife/shared';
import { Money } from '@/common/components';
import { cn } from '@/common/utils/cn';

export interface PackageCardProps {
  readonly pack: TopupPackage;
  readonly selected: boolean;
  readonly disabledReason: string | null;
  readonly onSelect: () => void;
}

const CARD_CLASS = 'relative flex h-full w-full flex-col items-start gap-1 rounded-sheet p-3.5 text-left ring-2 transition-[box-shadow,background-color]';
const cardState = (selected: boolean): string =>
  cn(CARD_CLASS, selected ? 'bg-danfo-soft ring-danfo' : 'bg-paper-2 ring-transparent hover:bg-paper-3', 'disabled:cursor-not-allowed disabled:opacity-55');

/** In-game naira you get (big) and the real naira you pay (on the price tag). */
export function PackageCard({ pack, selected, disabledReason, onSelect }: PackageCardProps) {
  return (
    <button type="button" onClick={onSelect} disabled={disabledReason !== null} aria-pressed={selected} className={cardState(selected)}>
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

export interface DollarPickCardProps {
  /** Whole dollars. */
  readonly dollars: number;
  /** ₦ per $1 from the server. */
  readonly ngnPerUsd: number;
  readonly selected: boolean;
  readonly disabledReason: string | null;
  readonly onSelect: () => void;
}

function creditFor(dollars: number, ngnPerUsd: number): number | null {
  try {
    return topupVirtualAmountUsd(dollars, ngnPerUsd);
  } catch {
    return null;
  }
}

/** A dollar quick pick: the in-game naira it buys (big), its naira value, and the dollars you pay (on the price tag). */
export function DollarPickCard({ dollars, ngnPerUsd, selected, disabledReason, onSelect }: DollarPickCardProps) {
  const price = formatUsdCents(dollars * 100);
  const credit = creditFor(dollars, ngnPerUsd);
  const reason = credit === null ? 'Not available' : disabledReason;
  return (
    <button type="button" onClick={onSelect} disabled={reason !== null} aria-pressed={selected} className={cardState(selected)}>
      <span className="text-sm font-bold">{price}</span>
      <span className="type-figure text-2xl leading-tight">{credit === null ? '—' : <Money amount={credit} compact />}</span>
      <span className="line-clamp-2 text-xs text-text-soft">Worth {formatNaira(dollars * ngnPerUsd)} in naira</span>
      <span className="mt-auto inline-flex items-center gap-1 rounded-chip bg-ink px-2 py-1 text-xs font-bold text-on-ink">Pay {price}</span>
      {reason && <span className="text-2xs font-bold text-okada">{reason}</span>}
    </button>
  );
}
