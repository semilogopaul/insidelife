import type { ReactNode } from 'react';
import type { WalletDto } from '@insidelife/shared';
import { Money } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { formatUsdCents } from '../services/usd';
import { tierLabel } from '../services/transfer-preview';

/**
 * The Bank's hero: cash in the wide display face on an ink card painted with the danfo double stripe. Savings,
 * pension and dollars sit underneath, small — cash is what you can spend right now.
 */
export function BalanceCard({ wallet, className }: { readonly wallet: WalletDto; readonly className?: string }) {
  return (
    <section aria-label="Your balances" className={cn('relative overflow-hidden rounded-sheet bg-ink px-5 pb-4 pt-5 text-on-ink', className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-on-ink-soft">Cash you can spend</p>
        <span className="rounded-chip bg-white/10 px-2 py-0.5 text-2xs font-bold text-on-ink">{tierLabel(wallet.transferTier)} account</span>
      </div>
      <p className={cn('type-figure mt-1.5 leading-none text-white', figureSize(wallet.balance))}>
        <Money amount={wallet.balance} />
      </p>
      <span aria-hidden className="-mx-5 mt-4 block h-[9px] danfo-stripes [--color-ink:var(--color-danfo)]" />
      {wallet.purchasedTotal > 0 && (
        <p className="mt-1.5 text-xs text-on-ink-soft">
          Includes <Money amount={wallet.purchasedTotal} compact /> bought with top-ups
        </p>
      )}
      <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-card bg-white/10">
        <Figure label="Savings" value={<Money amount={wallet.savings} compact />} />
        <Figure label="Pension" value={<Money amount={wallet.pension} compact />} />
        <Figure label="Dollars" value={formatUsdCents(wallet.usd)} />
      </dl>
    </section>
  );
}

/** Keep the hero figure on one line inside a 400px phone, from ₦0 to ₦999B. */
function figureSize(amount: number): string {
  const digits = String(Math.abs(Math.round(amount))).length;
  if (digits <= 7) return 'text-[2.6rem]';
  if (digits <= 9) return 'text-[2.2rem]';
  return 'text-[1.75rem]';
}

function Figure({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className="bg-ink-2 px-3 py-2.5">
      <dt className="text-2xs font-bold text-on-ink-soft">{label}</dt>
      <dd className="type-figure mt-0.5 truncate text-base text-white">{value}</dd>
    </div>
  );
}
