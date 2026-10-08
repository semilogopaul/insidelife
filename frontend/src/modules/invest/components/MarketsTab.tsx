'use client';

import { useMemo, useState } from 'react';
import type { InstrumentKind, MarketQuoteDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, Spinner, Tabs } from '@/common/components';
import { useMarkets } from '../hooks/use-invest';
import { formatUnitPrice } from '../services/invest-math';
import { ChangeBadge } from './ChangeBadge';
import { Ticker } from './Ticker';

const KINDS = [
  { id: 'stock', label: 'NGX stocks' },
  { id: 'crypto', label: 'Crypto' },
] as const;

/** Stocks and crypto with today's price and 1-day / 30-day moves. Tap one for the chart and to trade. */
export function MarketsTab({ onOpen }: { readonly onOpen: (instrumentId: string) => void }) {
  const markets = useMarkets();
  const [kind, setKind] = useState<InstrumentKind>('stock');
  const rows = useMemo(() => markets.data?.instruments.filter((quote) => quote.kind === kind) ?? [], [markets.data, kind]);

  return (
    <div className="flex flex-col gap-3">
      <Tabs items={KINDS} value={kind} onChange={setKind} label="Market" />
      <p className="text-xs text-text-soft">
        {kind === 'stock'
          ? 'Shares in Lagos companies. They pay dividends and tend to grow over years, with bumpy months.'
          : 'Wild swings both ways. Only put in what you can afford to watch fall by half.'}
      </p>
      {markets.isPending ? (
        <div className="grid place-items-center py-10 text-text-soft">
          <Spinner />
        </div>
      ) : markets.isError ? (
        <div className="rounded-card bg-okada-soft p-4 text-sm">
          <p className="text-okada">{errorMessage(markets.error)}</p>
          <Button variant="paper" size="sm" className="mt-2" onClick={() => void markets.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-line" aria-label={kind === 'stock' ? 'Stocks' : 'Crypto'}>
          {rows.map((quote) => (
            <MarketRow key={quote.instrumentId} quote={quote} onOpen={() => onOpen(quote.instrumentId)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MarketRow({ quote, onOpen }: { readonly quote: MarketQuoteDto; readonly onOpen: () => void }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 py-3 text-left hover:bg-paper-2/60">
        <Ticker id={quote.instrumentId} kind={quote.kind} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold leading-tight">{quote.name}</span>
          <span className="block truncate text-xs text-text-soft">
            {quote.instrumentId} · 30d <ChangeBadge ratio={quote.change30d} className="align-middle" />
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="type-figure block text-[0.95rem]">{formatUnitPrice(quote.price)}</span>
          <ChangeBadge ratio={quote.change1d} label="today" />
        </span>
      </button>
    </li>
  );
}
