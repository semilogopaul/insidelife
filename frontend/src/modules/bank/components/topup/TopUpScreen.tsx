'use client';

import { FlaskConical, Lock, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { findTopupPackage, formatNaira, type CreateTopupRequest, type TopupCatalogDto, type TopupPackage } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Badge, Button, Money, ProgressBar, Section, Spinner, TextField } from '@/common/components';
import { groupDigits, parseNairaInput } from '@/common/utils/money-input';
import { cn } from '@/common/utils/cn';
import { useStartTopup, useTopupCatalog } from '../../hooks/use-topups';
import { previewTopupAmount } from '../../services/topup-amount';
import { ScreenHeader } from '../ScreenHeader';
import { PackageCard } from './PackageCard';
import { PaymentHistory } from './PaymentHistory';

/** What the player is about to buy: a pack, or an amount they typed. */
type Choice = { readonly kind: 'pack'; readonly pack: TopupPackage } | { readonly kind: 'custom'; readonly amountNgn: number | null };

/**
 * Buy in-game naira with real naira through Flutterwave: a quick-pick pack or any whole amount (₦500 up to the
 * server's maximum), with what it buys shown live. Purchased money is labelled; a daily cap shows only if the owner
 * switched one on.
 */
export function TopUpScreen({ onBack }: { readonly onBack: () => void }) {
  const catalog = useTopupCatalog();
  const start = useStartTopup();
  const [choice, setChoice] = useState<Choice | null>(null);
  const leaving = start.isPending || start.isSuccess;

  const choose = (next: Choice): void => {
    start.reset();
    setChoice(next);
  };

  return (
    <div className="flex flex-col gap-5 pb-2">
      <ScreenHeader
        title="Top up"
        onBack={onBack}
        backLabel="Back to Bank"
        aside={
          catalog.data?.sandbox ? (
            <Badge tone="info">
              <FlaskConical size={12} aria-hidden /> Test mode
            </Badge>
          ) : null
        }
      />

      {catalog.isPending ? (
        <div className="grid place-items-center py-12 text-text-soft">
          <Spinner />
        </div>
      ) : catalog.isError ? (
        <div className="rounded-card bg-okada-soft p-4 text-sm">
          <p className="font-bold text-okada">Top-ups aren’t available right now</p>
          <p className="mt-1 text-text-soft">{errorMessage(catalog.error)}</p>
          <Button variant="paper" size="sm" className="mt-3" onClick={() => void catalog.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <DailyCap catalog={catalog.data} />

          <ul className="grid grid-cols-2 gap-2.5" aria-label="Top-up packs">
            {catalog.data.packages.map((pack) => (
              <li key={pack.id}>
                <PackageCard
                  pack={pack}
                  selected={choice?.kind === 'pack' && choice.pack.id === pack.id}
                  disabledReason={catalog.data.remainingTodayNgn !== null && pack.priceNgn > catalog.data.remainingTodayNgn ? 'Over today’s cap' : null}
                  onSelect={() => choose({ kind: 'pack', pack })}
                />
              </li>
            ))}
          </ul>

          <CustomAmount
            catalog={catalog.data}
            amountNgn={choice?.kind === 'custom' ? choice.amountNgn : null}
            active={choice?.kind === 'custom'}
            onChange={(amountNgn) => choose({ kind: 'custom', amountNgn })}
          />

          {choice && <Confirm catalog={catalog.data} choice={choice} start={start} leaving={leaving} />}
        </>
      )}

      <Section title="Payment history">
        <PaymentHistory
          onRetry={(payment) => {
            const pack = payment.topup?.packageId ? findTopupPackage(payment.topup.packageId) : undefined;
            if (pack) choose({ kind: 'pack', pack });
            else if (payment.topup) choose({ kind: 'custom', amountNgn: payment.amountNgn });
          }}
        />
      </Section>
    </div>
  );
}

/** Only when the owner has switched a daily real-money cap on. */
function DailyCap({ catalog }: { readonly catalog: TopupCatalogDto }) {
  if (catalog.dailyLimitNgn === null || catalog.remainingTodayNgn === null) {
    return <p className="rounded-card bg-paper-2 p-3.5 text-xs text-text-soft">Bought naira is labelled as bought and never counts toward the self-made rich list.</p>;
  }
  return (
    <div className="rounded-card bg-paper-2 p-3.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-bold">Left to top up today</span>
        <span className="type-figure">
          <Money amount={catalog.remainingTodayNgn} />
        </span>
      </div>
      <ProgressBar value={catalog.spentTodayNgn} max={catalog.dailyLimitNgn} label="Today’s top-up cap used" tone="ink" className="mt-2" />
      <p className="mt-1.5 text-xs text-text-soft">
        Real money is capped at {formatNaira(catalog.dailyLimitNgn)} a day. Bought naira is labelled and never counts toward the self-made rich list.
      </p>
    </div>
  );
}

interface CustomAmountProps {
  readonly catalog: TopupCatalogDto;
  readonly amountNgn: number | null;
  readonly active: boolean;
  readonly onChange: (amountNgn: number | null) => void;
}

/** Any whole amount, with "you get ₦X in game" updating as the player types. */
function CustomAmount({ catalog, amountNgn, active, onChange }: CustomAmountProps) {
  const preview = previewTopupAmount(amountNgn, catalog);
  return (
    <section aria-label="Custom amount" className={cn('rounded-sheet p-3.5 ring-2', active ? 'bg-danfo-soft ring-danfo' : 'bg-paper-2 ring-transparent')}>
      <TextField
        label="Or pay any amount"
        inputMode="numeric"
        autoComplete="off"
        placeholder={`${groupDigits(catalog.minNgn)} – ${groupDigits(catalog.maxPerPaymentNgn)}`}
        value={active ? groupDigits(amountNgn) : ''}
        onChange={(event) => onChange(parseNairaInput(event.target.value))}
        onFocus={() => !active && onChange(null)}
        trailing={<span className="text-sm font-bold text-text-soft">real ₦</span>}
        error={active ? preview.problem : null}
        hint={`Whole naira from ${formatNaira(catalog.minNgn)}. ₦10,000 or more gets the best rate.`}
      />
      <p className="mt-2 text-sm" aria-live="polite">
        {active && preview.virtualAmount !== null && preview.problem === null ? (
          <>
            You get <strong className="type-figure">{formatNaira(preview.virtualAmount)}</strong> in game{' '}
            <span className="text-text-soft">({formatNaira(preview.ratePerNaira ?? 0)} per ₦1)</span>
          </>
        ) : (
          <span className="text-text-soft">Type an amount to see what it buys.</span>
        )}
      </p>
    </section>
  );
}

interface ConfirmProps {
  readonly catalog: TopupCatalogDto;
  readonly choice: Choice;
  readonly start: ReturnType<typeof useStartTopup>;
  readonly leaving: boolean;
}

function Confirm({ catalog, choice, start, leaving }: ConfirmProps) {
  const custom = choice.kind === 'custom' ? previewTopupAmount(choice.amountNgn, catalog) : null;
  const priceNgn = choice.kind === 'pack' ? choice.pack.priceNgn : custom?.amountNgn;
  const virtualAmount = choice.kind === 'pack' ? choice.pack.virtualAmount : custom?.virtualAmount;
  if (priceNgn == null || virtualAmount == null || custom?.problem) return null;
  const request: CreateTopupRequest = choice.kind === 'pack' ? { packageId: choice.pack.id } : { amountNgn: priceNgn };

  return (
    <section aria-label="Confirm top-up" className="sticky bottom-0 -mx-1 rounded-sheet bg-ink p-4 text-on-ink shadow-[var(--shadow-lift)]">
      <p className="text-sm text-on-ink-soft">
        You pay <strong className="text-white">{formatNaira(priceNgn)}</strong> real money and get <strong className="text-danfo">{formatNaira(virtualAmount)}</strong>{' '}
        in your game wallet.
      </p>
      {start.isError && (
        <p role="alert" className="mt-2 rounded-chip bg-okada/20 p-2 text-sm text-white">
          {errorMessage(start.error)}
        </p>
      )}
      <Button size="lg" block className="mt-3" icon={<Lock size={18} aria-hidden />} loading={leaving} onClick={() => start.mutate(request)}>
        {leaving ? 'Opening checkout…' : catalog.sandbox ? `Pay ${formatNaira(priceNgn)} (test)` : `Pay ${formatNaira(priceNgn)} with Flutterwave`}
      </Button>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-on-ink-soft">
        <ShieldCheck size={14} aria-hidden />
        {catalog.sandbox ? 'Test checkout: no real money moves.' : 'Pay by card, bank transfer or USSD on Flutterwave’s secure page. You come straight back here.'}
      </p>
    </section>
  );
}
