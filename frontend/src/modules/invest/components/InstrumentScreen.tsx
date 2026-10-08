'use client';

import { ChevronLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatPercent, type RiskLevel } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Badge, Money, Spinner } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { useMarkets, usePortfolio, usePriceHistory } from '../hooks/use-invest';
import { formatUnitPrice, formatUnits } from '../services/invest-math';
import { ChangeBadge } from './ChangeBadge';
import { PriceChart } from './PriceChart';
import { Ticker } from './Ticker';
import { TradeForm } from './TradeForm';

const RANGES = [
  { days: 30, label: '30D' },
  { days: 90, label: '90D' },
  { days: 365, label: '1Y' },
] as const;

const RISK: Readonly<Record<RiskLevel, { readonly label: string; readonly tone: 'good' | 'warn' | 'bad' | 'ankara' }>> = {
  low: { label: 'Low risk', tone: 'good' },
  medium: { label: 'Medium risk', tone: 'warn' },
  high: { label: 'High risk', tone: 'bad' },
  extreme: { label: 'Extreme risk', tone: 'ankara' },
};

/** One stock or coin: price, the chart, the facts, your position and the trade ticket. */
export function InstrumentScreen({ instrumentId, onBack }: { readonly instrumentId: string; readonly onBack: () => void }) {
  const markets = useMarkets();
  const portfolio = usePortfolio();
  const [days, setDays] = useState<number>(90);
  const history = usePriceHistory(instrumentId, days);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const quote = markets.data?.instruments.find((item) => item.instrumentId === instrumentId);
  const holding = portfolio.data?.holdings.find((item) => item.instrumentId === instrumentId) ?? null;

  return (
    <div className="flex flex-col gap-4 pb-2">
      <button type="button" onClick={onBack} className="-ml-1 flex items-center gap-1 self-start text-sm font-bold text-text-soft hover:text-text">
        <ChevronLeft size={18} aria-hidden /> Markets
      </button>
      {!quote ? (
        <div className="grid place-items-center py-16 text-text-soft">{markets.isError ? errorMessage(markets.error) : <Spinner />}</div>
      ) : (
        <>
          <header className="flex items-start gap-3">
            <Ticker id={quote.instrumentId} kind={quote.kind} size="lg" />
            <div className="min-w-0 flex-1">
              <h3 ref={heading} tabIndex={-1} className="type-title text-xl leading-tight outline-none">
                {quote.name}
              </h3>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-text-soft">
                {quote.instrumentId} · {quote.sector.replace('-', ' & ')}
                <Badge tone={RISK[quote.risk].tone}>{RISK[quote.risk].label}</Badge>
              </p>
            </div>
          </header>
          <div>
            <p className="type-figure text-[2.2rem] leading-none">{formatUnitPrice(quote.price)}</p>
            <p className="mt-1 flex flex-wrap gap-x-3">
              <ChangeBadge ratio={quote.change1d} label="today" size="md" />
              <ChangeBadge ratio={quote.change30d} label="30 days" size="md" />
            </p>
          </div>

          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold">Price, last {days === 365 ? 'year' : `${days} days`}</h4>
            <div role="group" aria-label="Chart range" className="flex gap-1">
              {RANGES.map((range) => (
                <button
                  key={range.days}
                  type="button"
                  aria-pressed={days === range.days}
                  onClick={() => setDays(range.days)}
                  className={cn('h-8 rounded-full px-2.5 text-xs font-bold', days === range.days ? 'bg-ink text-on-ink' : 'bg-paper-2 text-text-soft hover:text-text')}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>
          {history.data ? (
            <PriceChart points={history.data.points} label={`${quote.name} price`} stale={history.isPlaceholderData} />
          ) : history.isError ? (
            <p className="rounded-card bg-okada-soft p-3 text-sm text-okada">{errorMessage(history.error)}</p>
          ) : (
            <div className="h-44 animate-pulse rounded-card bg-paper-2" aria-label="Loading chart" />
          )}

          <p className="text-sm text-text-soft">{quote.blurb}</p>
          <dl className="grid grid-cols-3 gap-2 text-center">
            <Fact label="Dividend" value={quote.dividendYield > 0 ? `${formatPercent(quote.dividendYield)} / yr` : 'None'} />
            <Fact label="Broker fee" value={formatPercent(quote.feeRate)} />
            <Fact label="Tax on payouts" value="10%" />
          </dl>

          {holding && (
            <section aria-label="Your position" className="rounded-sheet ring-1 ring-line">
              <div className="flex items-baseline justify-between gap-3 px-4 pt-3">
                <h4 className="font-bold">You own</h4>
                <span className="type-figure text-lg">
                  <Money amount={holding.value} />
                </span>
              </div>
              <p className="flex items-center justify-between gap-3 px-4 pb-3 text-xs text-text-soft">
                <span>
                  {formatUnits(holding.units)} units · paid <Money amount={holding.costBasis} />
                </span>
                <span>
                  <Money amount={holding.unrealizedGain} signed className="font-bold" />
                  {holding.costBasis > 0 && <ChangeBadge ratio={holding.unrealizedGain / holding.costBasis} className="ml-1" />}
                </span>
              </p>
            </section>
          )}
          <TradeForm key={quote.instrumentId} quote={quote} holding={holding} cash={portfolio.data?.cash ?? 0} />
        </>
      )}
    </div>
  );
}

function Fact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-card bg-paper-2 px-2 py-2">
      <dt className="text-2xs font-bold text-text-soft">{label}</dt>
      <dd className="mt-0.5 text-sm font-bold">{value}</dd>
    </div>
  );
}
