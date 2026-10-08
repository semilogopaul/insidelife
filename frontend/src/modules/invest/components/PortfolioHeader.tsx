import type { PortfolioDto } from '@insidelife/shared';
import { Money } from '@/common/components';
import { ChangeBadge } from './ChangeBadge';

/** Everything you own in one figure, and how your stocks & crypto are doing against what you paid. */
export function PortfolioHeader({ portfolio }: { readonly portfolio: PortfolioDto }) {
  const invested = portfolio.holdings.reduce((sum, holding) => sum + holding.costBasis, 0);
  const gain = portfolio.holdings.reduce((sum, holding) => sum + holding.unrealizedGain, 0);
  const parts = [
    { label: 'Cash', value: portfolio.cash },
    { label: 'Stocks & crypto', value: portfolio.totals.holdingsValue },
    { label: 'Deposits', value: portfolio.totals.depositsValue + portfolio.totals.savings },
    { label: 'Dollars', value: portfolio.totals.usdValue },
  ];
  return (
    <section aria-label="Portfolio summary" className="rounded-sheet bg-ink px-5 pb-4 pt-5 text-on-ink">
      <p className="text-sm font-bold text-on-ink-soft">Everything you own</p>
      <p className="type-figure mt-1 text-[2.3rem] leading-none text-white">
        <Money amount={portfolio.totals.total} />
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-on-ink-soft">
        {invested > 0 ? (
          <>
            <span className="rounded-chip bg-white px-1.5 py-0.5">
              <ChangeBadge ratio={gain / invested} />
            </span>
            <span>
              <span className={gain >= 0 ? 'font-bold text-[#8be6b4]' : 'font-bold text-[#ffaa9e]'}>
                {gain > 0 ? '+' : ''}
                <Money amount={gain} />
              </span>{' '}
              on stocks & crypto
            </span>
          </>
        ) : (
          <span>Nothing in the market yet. Start small — you can buy from ₦1,000.</span>
        )}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-card bg-white/10">
        {parts.map((part) => (
          <div key={part.label} className="bg-ink-2 px-3 py-2">
            <dt className="text-2xs font-bold text-on-ink-soft">{part.label}</dt>
            <dd className="type-figure text-base text-white">
              <Money amount={part.value} compact />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
