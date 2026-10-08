'use client';

import { useState, type ReactNode } from 'react';
import { formatNaira, type HoldingDto, type MarketQuoteDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, Money, Tabs, toast } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { usePlaceOrder } from '../hooks/use-invest';
import { newIdempotencyKey } from '@/common/utils/money-input';
import { formatUnits, previewTrade } from '../services/invest-math';
import { NairaInput } from './NairaInput';

type Side = 'buy' | 'sell';

export interface TradeFormProps {
  readonly quote: MarketQuoteDto;
  readonly holding: HoldingDto | null;
  readonly cash: number;
}

/** Market order in naira, with the broker fee and units shown before you commit. */
export function TradeForm({ quote, holding, cash }: TradeFormProps) {
  const [side, setSide] = useState<Side>('buy');
  const [amount, setAmount] = useState<number | null>(null);
  const [sellAll, setSellAll] = useState(false);
  const [intentKey, setIntentKey] = useState(newIdempotencyKey);
  const order = usePlaceOrder();
  const heldUnits = holding?.units ?? 0;
  const preview = previewTrade(sellAll ? (holding?.value ?? 0) : amount, { side, kind: quote.kind, price: quote.price, cash, heldUnits });
  const ready = preview.net > 0 && preview.problem === null;

  const change = (next: number | null): void => {
    setAmount(next);
    setSellAll(false);
    setIntentKey(newIdempotencyKey());
    order.reset();
  };

  const submit = (): void => {
    const body = sellAll
      ? { instrumentId: quote.instrumentId, side, units: heldUnits, idempotencyKey: intentKey }
      : { instrumentId: quote.instrumentId, side, amountNaira: amount ?? 0, idempotencyKey: intentKey };
    order.mutate(body, {
      onSuccess: (result) => {
        const { trade } = result;
        toast({
          title: side === 'buy' ? `Bought ${formatUnits(trade.units)} ${quote.instrumentId}` : `Sold ${formatUnits(trade.units)} ${quote.instrumentId}`,
          body: side === 'sell' && trade.realizedGain !== null ? `${trade.realizedGain >= 0 ? 'Profit' : 'Loss'} on this sale: ${formatNaira(Math.abs(trade.realizedGain))}` : `Broker fee ${formatNaira(trade.fee)}`,
          tone: 'good',
          amount: side === 'buy' ? -(trade.gross + trade.fee) : trade.gross - trade.fee,
        });
        setAmount(null);
        setSellAll(false);
        setIntentKey(newIdempotencyKey());
      },
    });
  };

  const presets = side === 'buy' ? [10_000, 50_000, 250_000] : [];
  return (
    <section aria-label={`Trade ${quote.instrumentId}`} className="flex flex-col gap-3 rounded-sheet bg-paper-2 p-4">
      <Tabs
        items={[
          { id: 'buy', label: 'Buy' },
          { id: 'sell', label: holding ? 'Sell' : 'Sell (none held)' },
        ]}
        value={side}
        onChange={(next) => {
          setSide(next);
          change(null);
        }}
        label="Order side"
      />
      <NairaInput
        label={side === 'buy' ? 'How much to invest' : 'How much to sell'}
        value={sellAll ? (holding?.value ?? null) : amount}
        onChange={change}
        hint={side === 'buy' ? `Cash available: ${formatNaira(cash)}` : holding ? `You hold ${formatUnits(heldUnits)} units worth ${formatNaira(holding.value)}` : 'You don’t own any yet.'}
      />
      <div className="flex flex-wrap gap-1.5">
        {presets.map((value) => (
          <Chip key={value} active={amount === value} onClick={() => change(value)}>
            <Money amount={value} compact />
          </Chip>
        ))}
        {side === 'sell' && holding && (
          <>
            {[0.25, 0.5].map((share) => (
              <Chip key={share} active={false} onClick={() => change(Math.floor(holding.value * share))}>
                {share * 100}%
              </Chip>
            ))}
            <Chip
              active={sellAll}
              onClick={() => {
                change(null);
                setSellAll(true);
              }}
            >
              Sell all
            </Chip>
          </>
        )}
      </div>

      {preview.net > 0 && (
        <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
          <dt className="text-text-soft">{side === 'buy' ? 'You get about' : 'Units sold'}</dt>
          <dd className="tabular text-right font-bold">
            {formatUnits(preview.units)} {quote.instrumentId}
          </dd>
          <dt className="text-text-soft">Broker fee ({(quote.feeRate * 100).toFixed(1)}%)</dt>
          <dd className="tabular text-right">
            <Money amount={preview.fee} />
          </dd>
          <dt className="font-bold">{side === 'buy' ? 'Total from your cash' : 'You receive'}</dt>
          <dd className="type-figure text-right">
            <Money amount={preview.net} />
          </dd>
        </dl>
      )}
      {preview.problem && <p className="text-sm font-bold text-okada">{preview.problem}</p>}
      {order.isError && (
        <p role="alert" className="rounded-card bg-okada-soft p-3 text-sm text-okada">
          {errorMessage(order.error)}
        </p>
      )}
      <Button size="lg" block variant={side === 'buy' ? 'danfo' : 'ink'} disabled={!ready} loading={order.isPending} onClick={submit}>
        {ready ? `${side === 'buy' ? 'Buy' : 'Sell'} ${formatNaira(preview.gross)} of ${quote.instrumentId}` : side === 'buy' ? 'Enter an amount' : holding ? 'Enter an amount' : 'Nothing to sell'}
      </Button>
      <p className="text-center text-2xs text-text-soft">Orders fill at today’s price. Prices move once a game day.</p>
    </section>
  );
}

function Chip({ active, onClick, children }: { readonly active: boolean; readonly onClick: () => void; readonly children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn('h-8 rounded-full px-3 text-sm font-bold ring-1', active ? 'bg-ink text-on-ink ring-ink' : 'bg-paper ring-line hover:bg-paper-3')}
    >
      {children}
    </button>
  );
}
