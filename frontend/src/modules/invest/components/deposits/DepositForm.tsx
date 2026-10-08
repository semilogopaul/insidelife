'use client';

import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { DEPOSIT_PRODUCTS, formatDate, formatNaira, formatPercent, type FixedIncomeOfferDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, Money, toast } from '@/common/components';
import { gameClock } from '@/common/game/game-clock';
import { cn } from '@/common/utils/cn';
import { useOpenDeposit } from '../../hooks/use-invest';
import { newIdempotencyKey } from '@/common/utils/money-input';
import { previewDeposit } from '../../services/invest-math';
import { NairaInput } from '../NairaInput';

/** Pick a tenor, type an amount, see the maturity date, the interest after tax and what breaking early costs. */
export function DepositForm({ offer, cash, onDone }: { readonly offer: FixedIncomeOfferDto; readonly cash: number; readonly onDone: () => void }) {
  const [tenor, setTenor] = useState<number | null>(offer.rates.at(-1)?.tenorDays ?? null);
  const [amount, setAmount] = useState<number | null>(null);
  const [intentKey, setIntentKey] = useState(newIdempotencyKey);
  const open = useOpenDeposit();
  const rate = offer.rates.find((entry) => entry.tenorDays === tenor)?.annualRate ?? offer.rates[0]?.annualRate ?? 0;
  const preview = previewDeposit(offer.product, amount, rate, tenor, gameClock.now());
  const overCash = amount !== null && amount > cash;
  const problem = preview.problem ?? (overCash ? `You only have ${formatNaira(cash)} in cash.` : null);
  const fixed = DEPOSIT_PRODUCTS[offer.product].tenors.length > 0;

  const submit = (): void => {
    if (amount === null) return;
    open.mutate(
      { product: offer.product, tenorDays: fixed ? (tenor ?? undefined) : undefined, amount, idempotencyKey: intentKey },
      {
        onSuccess: (deposit) => {
          toast({ title: `${deposit.label} opened`, body: deposit.maturesAt ? `Matures ${formatDate(deposit.maturesAt)}.` : 'Interest starts today.', tone: 'good', amount: -deposit.principal });
          setIntentKey(newIdempotencyKey());
          onDone();
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      {fixed && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-bold">How long?</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {offer.rates.map((entry) => (
              <button
                key={entry.tenorDays}
                type="button"
                aria-pressed={tenor === entry.tenorDays}
                onClick={() => setTenor(entry.tenorDays)}
                className={cn('flex flex-col items-center rounded-card py-2 ring-1', tenor === entry.tenorDays ? 'bg-ink text-on-ink ring-ink' : 'bg-paper ring-line hover:bg-paper-3')}
              >
                <span className="text-sm font-bold">{entry.tenorDays} days</span>
                <span className={cn('text-xs', tenor === entry.tenorDays ? 'text-on-ink-soft' : 'text-text-soft')}>{formatPercent(entry.annualRate, 2)} a year</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <NairaInput
        label="Amount"
        value={amount}
        onChange={(value) => {
          setAmount(value);
          setIntentKey(newIdempotencyKey());
          open.reset();
        }}
        error={amount !== null ? problem : null}
        hint={`From ${formatNaira(offer.minAmount)} · cash available ${formatNaira(cash)}`}
      />
      {amount !== null && amount > 0 && !problem && (
        <dl className="grid grid-cols-[1fr_auto] gap-y-1 rounded-card bg-paper p-3 text-sm ring-1 ring-line">
          <dt className="text-text-soft">{fixed ? 'Interest at maturity' : 'Interest in 30 days (estimate)'}</dt>
          <dd className="tabular text-right">
            <Money amount={preview.grossInterest} />
          </dd>
          <dt className="text-text-soft">Withholding tax (10%)</dt>
          <dd className="tabular text-right">−<Money amount={preview.tax} /></dd>
          <dt className="font-bold">{fixed ? 'You get back' : 'Value after 30 days'}</dt>
          <dd className="type-figure text-right text-naira">
            <Money amount={preview.payout} />
          </dd>
          {preview.maturesAt !== null && (
            <>
              <dt className="text-text-soft">Matures</dt>
              <dd className="text-right font-bold">{formatDate(preview.maturesAt)}</dd>
            </>
          )}
        </dl>
      )}
      {fixed && (
        <p className="flex gap-2 rounded-card bg-danfo-soft p-3 text-xs text-[#5c4100]">
          <TriangleAlert size={16} aria-hidden className="mt-px shrink-0" />
          <span>
            Need it back early? You lose all the interest
            {offer.earlyBreakPenaltyRate > 0 && (
              <>
                {' '}and pay a {formatPercent(offer.earlyBreakPenaltyRate)} charge{amount ? <> ({formatNaira(preview.earlyBreakPenalty)})</> : null}
              </>
            )}
            . Only lock away money you won’t need before it matures.
          </span>
        </p>
      )}
      {open.isError && (
        <p role="alert" className="rounded-card bg-okada-soft p-3 text-sm text-okada">
          {errorMessage(open.error)}
        </p>
      )}
      <Button size="lg" block disabled={amount === null || problem !== null} loading={open.isPending} onClick={submit}>
        {amount === null ? 'Enter an amount' : `${offer.product === 'tbill' ? 'Buy T-bill' : offer.product === 'fixed-deposit' ? 'Open fixed deposit' : 'Invest'} · ${formatNaira(amount)}`}
      </Button>
    </div>
  );
}
