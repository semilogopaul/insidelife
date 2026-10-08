'use client';

import { useState } from 'react';
import { FX_MONTHLY_ALLOWANCE_USD_CENTS, FX_SPREAD, formatNaira, type FxSide, type PortfolioDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, Money, ProgressBar, Tabs, TextField, toast } from '@/common/components';
import { useFxOrder } from '../hooks/use-invest';
import { newIdempotencyKey } from '@/common/utils/money-input';
import { parseUsdInput, previewFx } from '../services/invest-math';
import { NairaInput } from './NairaInput';

const usd = (cents: number): string => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const rate = (naira: number): string => `₦${new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(naira)}`;

/** The FX desk: parallel rate ± 2%, a monthly allowance, buy with naira or sell dollars. */
export function DollarsTab({ portfolio }: { readonly portfolio: PortfolioDto }) {
  const [side, setSide] = useState<FxSide>('buy-usd');
  const [naira, setNaira] = useState<number | null>(null);
  const [usdText, setUsdText] = useState('');
  const [intentKey, setIntentKey] = useState(newIdempotencyKey);
  const fx = useFxOrder();
  const { usd: account } = portfolio;
  const cents = parseUsdInput(usdText);
  const preview = previewFx(side, side === 'buy-usd' ? naira : cents, account.midRate);
  const allowanceUsed = FX_MONTHLY_ALLOWANCE_USD_CENTS - account.allowanceRemainingCents;

  const problem =
    preview === null
      ? null
      : side === 'buy-usd'
        ? preview.naira > portfolio.cash
          ? `You only have ${formatNaira(portfolio.cash)} in cash.`
          : preview.usdCents > account.allowanceRemainingCents
            ? `That’s over this month’s allowance (${usd(account.allowanceRemainingCents)} left).`
            : null
        : preview.usdCents > account.balanceCents
          ? `You only have ${usd(account.balanceCents)} in your dom account.`
          : null;

  const reset = (): void => {
    setIntentKey(newIdempotencyKey());
    fx.reset();
  };

  const submit = (): void => {
    const body = side === 'buy-usd' ? { side, amountNaira: naira ?? 0, idempotencyKey: intentKey } : { side, amountUsd: (cents ?? 0) / 100, idempotencyKey: intentKey };
    fx.mutate(body, {
      onSuccess: (result) => {
        toast({
          title: side === 'buy-usd' ? `Bought ${usd(result.usdCents)}` : `Sold ${usd(result.usdCents)}`,
          body: `At ${rate(result.appliedRate)} per dollar.`,
          tone: 'good',
          amount: side === 'buy-usd' ? -result.naira : result.naira,
        });
        setNaira(null);
        setUsdText('');
        reset();
      },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Dollar account" className="rounded-sheet bg-paper-2 p-4">
        <p className="text-sm font-bold text-text-soft">Dom account</p>
        <p className="type-figure text-3xl leading-tight">{usd(account.balanceCents)}</p>
        <p className="text-xs text-text-soft">
          Worth about <Money amount={account.nairaValue} /> at today’s rate.
        </p>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Rate label="Market rate" value={rate(account.midRate)} />
          <Rate label="You buy at" value={rate(account.buyRate)} />
          <Rate label="You sell at" value={rate(account.sellRate)} />
        </dl>
      </section>
      <p className="text-sm text-text-soft">
        Dollars hold value when the naira slips. The desk keeps {Math.round(FX_SPREAD * 100)}% each way, so quick flips lose money — think months, not days.
      </p>
      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-bold">Allowance left this month</span>
          <span className="type-figure">{usd(account.allowanceRemainingCents)}</span>
        </div>
        <ProgressBar value={allowanceUsed} max={FX_MONTHLY_ALLOWANCE_USD_CENTS} label="Monthly dollar allowance used" tone="ink" className="mt-1.5" />
      </div>

      <Tabs
        items={[
          { id: 'buy-usd', label: 'Buy dollars' },
          { id: 'sell-usd', label: 'Sell dollars' },
        ]}
        value={side}
        onChange={(next) => {
          setSide(next);
          setNaira(null);
          setUsdText('');
          reset();
        }}
        label="Dollar desk"
      />
      {side === 'buy-usd' ? (
        <NairaInput label="Naira to spend" value={naira} onChange={(value) => { setNaira(value); reset(); }} error={problem} hint={`Cash available: ${formatNaira(portfolio.cash)}`} />
      ) : (
        <TextField
          label="Dollars to sell"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={usdText}
          onChange={(event) => {
            setUsdText(event.target.value.replace(/[^\d.]/g, ''));
            reset();
          }}
          error={problem}
          hint={`You have ${usd(account.balanceCents)}`}
          trailing={<span className="text-sm font-bold text-text-faint">USD</span>}
        />
      )}
      {preview && !problem && (
        <p className="rounded-card bg-paper-2 p-3 text-sm">
          {side === 'buy-usd' ? (
            <>
              You get <strong className="type-figure">{usd(preview.usdCents)}</strong> for <Money amount={preview.naira} className="font-bold" /> at {rate(preview.rate)}/$.
            </>
          ) : (
            <>
              You get <Money amount={preview.naira} className="type-figure font-bold" /> for {usd(preview.usdCents)} at {rate(preview.rate)}/$.
            </>
          )}
        </p>
      )}
      {fx.isError && (
        <p role="alert" className="rounded-card bg-okada-soft p-3 text-sm text-okada">
          {errorMessage(fx.error)}
        </p>
      )}
      <Button size="lg" block disabled={!preview || problem !== null} loading={fx.isPending} onClick={submit}>
        {!preview ? 'Enter an amount' : side === 'buy-usd' ? `Buy ${usd(preview.usdCents)}` : `Sell ${usd(preview.usdCents)}`}
      </Button>
    </div>
  );
}

function Rate({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-card bg-paper px-1.5 py-2">
      <dt className="text-2xs font-bold text-text-soft">{label}</dt>
      <dd className="tabular mt-0.5 text-sm font-bold">{value}</dd>
    </div>
  );
}
