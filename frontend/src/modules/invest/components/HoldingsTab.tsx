'use client';

import { ChartCandlestick, TriangleAlert } from 'lucide-react';
import { formatDate, type PortfolioDto } from '@insidelife/shared';
import { Badge, Button, EmptyState, Money, Section } from '@/common/components';
import { useTrades } from '../hooks/use-invest';
import { formatUnitPrice, formatUnits } from '../services/invest-math';
import { ChangeBadge } from './ChangeBadge';
import { Ticker } from './Ticker';


/** What you own in the market, what it's worth now versus what you paid, and recent trades. */
export function HoldingsTab({ portfolio, onOpen, onBrowse }: { readonly portfolio: PortfolioDto; readonly onOpen: (id: string) => void; readonly onBrowse: () => void }) {
  const trades = useTrades();
  return (
    <div className="flex flex-col gap-5">
      {portfolio.holdings.length === 0 ? (
        <EmptyState
          icon={ChartCandlestick}
          title="No stocks or crypto yet"
          body="Buy a small piece of a Lagos company and watch it over a few game weeks."
          action={<Button onClick={onBrowse}>Browse markets</Button>}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-line" aria-label="Your holdings">
          {portfolio.holdings.map((holding) => (
            <li key={holding.instrumentId}>
              <button type="button" onClick={() => onOpen(holding.instrumentId)} className="flex w-full items-center gap-3 py-3 text-left">
                <Ticker id={holding.instrumentId} kind={holding.kind} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{holding.name}</span>
                  <span className="block text-xs text-text-soft">
                    {formatUnits(holding.units)} units at {formatUnitPrice(holding.price)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="type-figure block">
                    <Money amount={holding.value} />
                  </span>
                  {holding.costBasis > 0 && <ChangeBadge ratio={holding.unrealizedGain / holding.costBasis} />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {portfolio.ponzi.length > 0 && (
        <Section title="Schemes">
          <ul className="flex flex-col gap-2">
            {portfolio.ponzi.map((stake) => (
              <li key={stake.id} className="flex items-start gap-3 rounded-card bg-okada-soft p-3 text-sm">
                <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0 text-okada" />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{stake.scheme}</span>
                  <span className="block text-text-soft">
                    Put in <Money amount={stake.amount} />, promised <Money amount={stake.promisedPayout} /> by {formatDate(stake.payoutAt)}.
                  </span>
                </span>
                <Badge tone={stake.status === 'paid' ? 'good' : stake.status === 'collapsed' ? 'bad' : 'warn'}>{stake.status === 'active' ? 'Waiting' : stake.status === 'paid' ? 'Paid out' : 'Collapsed'}</Badge>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {trades.data && trades.data.length > 0 && (
        <Section title="Recent trades">
          <ul className="flex flex-col divide-y divide-line text-sm">
            {trades.data.slice(0, 8).map((trade) => (
              <li key={trade.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="font-bold">{tradeLabel(trade.side)}</span> {trade.instrumentId === 'USD' ? `$${trade.units.toFixed(2)}` : `${formatUnits(trade.units)} ${trade.instrumentId}`}
                  <span className="block text-xs text-text-soft">
                    {formatDate(trade.gameMinute)} · fee {trade.fee === 0 ? 'none' : <Money amount={trade.fee} />}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <Money amount={trade.gross} className="font-bold" />
                  {trade.realizedGain !== null && <Money amount={trade.realizedGain} signed className="block text-xs" />}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function tradeLabel(side: string): string {
  if (side === 'buy') return 'Bought';
  if (side === 'sell') return 'Sold';
  if (side === 'buy-usd') return 'Bought';
  return 'Sold';
}
