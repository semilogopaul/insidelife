'use client';

import { FlaskConical, Lock, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import {
  findTopupPackage,
  formatNaira,
  formatUsdCents,
  type CreateTopupRequest,
  type PaymentDto,
  type TopupCatalogDto,
  type TopupPackage,
  type TopupUsdCatalogDto,
} from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Badge, Button, Money, ProgressBar, Section, Spinner, TextField } from '@/common/components';
import { PAYMENT_METHOD_LABELS, PayInPicker, paymentChoiceBody, rateLine, usePaymentChoice, type PaymentChoiceControl } from '@/common/payments';
import { groupDigits, parseNairaInput } from '@/common/utils/money-input';
import { cn } from '@/common/utils/cn';
import { useStartTopup, useTopupCatalog } from '../../hooks/use-topups';
import { previewTopupAmount, previewTopupUsd } from '../../services/topup-amount';
import { ScreenHeader } from '../ScreenHeader';
import { DollarPickCard, PackageCard } from './PackageCard';
import { PaymentHistory } from './PaymentHistory';

/** What the player is about to buy: a pack, or an amount they typed, in naira or (when offered) whole dollars. */
type Choice =
  | { readonly kind: 'pack'; readonly pack: TopupPackage }
  | { readonly kind: 'custom'; readonly amountNgn: number | null }
  | { readonly kind: 'usd-pick'; readonly dollars: number }
  | { readonly kind: 'usd-custom'; readonly dollars: number | null };

const isDollarChoice = (choice: Choice): choice is Extract<Choice, { kind: 'usd-pick' | 'usd-custom' }> => choice.kind === 'usd-pick' || choice.kind === 'usd-custom';

/**
 * Buy in-game naira with real money through Flutterwave: a quick-pick pack or any whole amount (₦500 up to the
 * server's maximum), with what it buys shown live. When the server takes dollars, "Pay in ₦ / $" switches to whole-dollar
 * quick picks and amounts (the game still credits naira). Purchased money is labelled; a daily cap shows only if the
 * owner switched one on.
 */
export function TopUpScreen({ onBack }: { readonly onBack: () => void }) {
  const catalog = useTopupCatalog();
  const start = useStartTopup();
  const usd = catalog.data?.usd ?? null;
  const payment = usePaymentChoice(usd);
  const [choice, setChoice] = useState<Choice | null>(null);
  const leaving = start.isPending || start.isSuccess;

  const choose = (next: Choice | null): void => {
    start.reset();
    setChoice(next);
  };

  /** "Try again" on a history row: the same pack or amount, in the currency it was paid in (naira if dollars are off now). */
  const retry = (paid: PaymentDto): void => {
    if (!paid.topup) return;
    if (paid.currency === 'USD' && usd) {
      const dollars = paid.amountMinor / 100;
      payment.chooseCurrency('USD');
      choose(usd.quickPicksUsd.includes(dollars) ? { kind: 'usd-pick', dollars } : { kind: 'usd-custom', dollars });
      return;
    }
    payment.chooseCurrency('NGN');
    const pack = paid.topup.packageId ? findTopupPackage(paid.topup.packageId) : undefined;
    choose(pack ? { kind: 'pack', pack } : { kind: 'custom', amountNgn: Math.round(paid.amountNgn) });
  };

  const dollars = payment.currency === 'USD' && usd !== null;
  // A choice in the other currency (dollars just switched off, say) is never paid.
  const live = choice && isDollarChoice(choice) === dollars ? choice : null;

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

          <PayInPicker usd={usd} payment={payment} onCurrencyChange={() => choose(null)} />

          {dollars ? (
            <>
              <ul className="grid grid-cols-2 gap-2.5" aria-label="Dollar top-ups">
                {usd.quickPicksUsd.map((amount) => (
                  <li key={amount}>
                    <DollarPickCard
                      dollars={amount}
                      ngnPerUsd={usd.ngnPerUsd}
                      selected={live?.kind === 'usd-pick' && live.dollars === amount}
                      disabledReason={catalog.data.remainingTodayNgn !== null && amount * usd.ngnPerUsd > catalog.data.remainingTodayNgn ? 'Over today’s cap' : null}
                      onSelect={() => choose({ kind: 'usd-pick', dollars: amount })}
                    />
                  </li>
                ))}
              </ul>
              <CustomDollars
                usd={usd}
                remainingTodayNgn={catalog.data.remainingTodayNgn}
                dollars={live?.kind === 'usd-custom' ? live.dollars : null}
                active={live?.kind === 'usd-custom'}
                onChange={(amount) => choose({ kind: 'usd-custom', dollars: amount })}
              />
            </>
          ) : (
            <>
              <ul className="grid grid-cols-2 gap-2.5" aria-label="Top-up packs">
                {catalog.data.packages.map((pack) => (
                  <li key={pack.id}>
                    <PackageCard
                      pack={pack}
                      selected={live?.kind === 'pack' && live.pack.id === pack.id}
                      disabledReason={catalog.data.remainingTodayNgn !== null && pack.priceNgn > catalog.data.remainingTodayNgn ? 'Over today’s cap' : null}
                      onSelect={() => choose({ kind: 'pack', pack })}
                    />
                  </li>
                ))}
              </ul>

              <CustomAmount
                catalog={catalog.data}
                amountNgn={live?.kind === 'custom' ? live.amountNgn : null}
                active={live?.kind === 'custom'}
                onChange={(amountNgn) => choose({ kind: 'custom', amountNgn })}
              />
            </>
          )}

          {live ? (
            <Confirm catalog={catalog.data} choice={live} payment={payment} start={start} leaving={leaving} />
          ) : (
            // The refusal took the choice away (dollars just switched off, say): still say why.
            start.isError && (
              <p role="alert" className="rounded-card bg-okada-soft p-3 text-sm text-okada">
                {errorMessage(start.error)}
              </p>
            )
          )}
        </>
      )}

      <Section title="Payment history">
        <PaymentHistory onRetry={retry} />
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
        Real money is capped at {formatNaira(catalog.dailyLimitNgn)} a day{catalog.usd ? ' (dollar top-ups count at their naira value)' : ''}. Bought naira is
        labelled and never counts toward the self-made rich list.
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

interface CustomDollarsProps {
  readonly usd: TopupUsdCatalogDto;
  readonly remainingTodayNgn: number | null;
  readonly dollars: number | null;
  readonly active: boolean;
  readonly onChange: (dollars: number | null) => void;
}

/** Any whole-dollar amount, with the game naira it buys at today's rate. */
function CustomDollars({ usd, remainingTodayNgn, dollars, active, onChange }: CustomDollarsProps) {
  const preview = previewTopupUsd(dollars, usd, remainingTodayNgn);
  return (
    <section aria-label="Custom dollar amount" className={cn('rounded-sheet p-3.5 ring-2', active ? 'bg-danfo-soft ring-danfo' : 'bg-paper-2 ring-transparent')}>
      <TextField
        label="Or pay any dollar amount"
        inputMode="numeric"
        autoComplete="off"
        placeholder={`${groupDigits(usd.minUsd)} – ${groupDigits(usd.maxPerPaymentUsd)}`}
        value={active ? groupDigits(dollars) : ''}
        onChange={(event) => onChange(parseNairaInput(event.target.value))}
        onFocus={() => !active && onChange(null)}
        trailing={<span className="text-sm font-bold text-text-soft">real $</span>}
        error={active ? preview.problem : null}
        hint={`Whole dollars from ${formatUsdCents(usd.minUsd * 100)} to ${formatUsdCents(usd.maxPerPaymentUsd * 100)}. ${rateLine(usd.ngnPerUsd)}.`}
      />
      <p className="mt-2 text-sm" aria-live="polite">
        {active && preview.virtualAmount !== null && preview.problem === null ? (
          <>
            You get <strong className="type-figure">{formatNaira(preview.virtualAmount)}</strong> in game{' '}
            <span className="text-text-soft">({rateLine(usd.ngnPerUsd)})</span>
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
  readonly payment: PaymentChoiceControl;
  readonly start: ReturnType<typeof useStartTopup>;
  readonly leaving: boolean;
}

/** What it costs, what lands, and the one button. Built from what's on screen, so what's sent is what was shown. */
interface Quote {
  /** "₦2,500" or "$5". */
  readonly price: string;
  readonly virtualAmount: number;
  /** For dollars: "$5 = ₦7,500 at ₦1,500 per $1". */
  readonly detail: string | null;
  readonly request: CreateTopupRequest;
}

function quoteFor(choice: Choice, catalog: TopupCatalogDto, payment: PaymentChoiceControl): Quote | null {
  if (isDollarChoice(choice)) {
    const usd = catalog.usd;
    if (!usd || payment.currency !== 'USD') return null;
    const preview = previewTopupUsd(choice.dollars, usd, catalog.remainingTodayNgn);
    if (preview.dollars === null || preview.virtualAmount === null || preview.nairaValue === null || preview.problem) return null;
    const price = formatUsdCents(preview.dollars * 100);
    return {
      price,
      virtualAmount: preview.virtualAmount,
      detail: `${price} = ${formatNaira(preview.nairaValue)} at ${rateLine(usd.ngnPerUsd)}.`,
      request: { amountUsd: preview.dollars, ...paymentChoiceBody(payment, usd) },
    };
  }
  if (choice.kind === 'pack') return { price: formatNaira(choice.pack.priceNgn), virtualAmount: choice.pack.virtualAmount, detail: null, request: { packageId: choice.pack.id } };
  const custom = previewTopupAmount(choice.amountNgn, catalog);
  if (custom.amountNgn === null || custom.virtualAmount === null || custom.problem) return null;
  return { price: formatNaira(custom.amountNgn), virtualAmount: custom.virtualAmount, detail: null, request: { amountNgn: custom.amountNgn } };
}

function Confirm({ catalog, choice, payment, start, leaving }: ConfirmProps) {
  const quote = quoteFor(choice, catalog, payment);
  if (!quote) return null;
  const dollars = isDollarChoice(choice);
  const wallet = dollars && payment.method !== 'card' ? PAYMENT_METHOD_LABELS[payment.method] : null;

  return (
    <section aria-label="Confirm top-up" className="sticky bottom-0 -mx-1 rounded-sheet bg-ink p-4 text-on-ink shadow-[var(--shadow-lift)]">
      <p className="text-sm text-on-ink-soft">
        You pay <strong className="text-white">{quote.price}</strong> real money and get <strong className="text-danfo">{formatNaira(quote.virtualAmount)}</strong> in
        your game wallet.
      </p>
      {quote.detail && <p className="mt-1 text-xs text-on-ink-soft">{quote.detail}</p>}
      {start.isError && (
        <p role="alert" className="mt-2 rounded-chip bg-okada/20 p-2 text-sm text-white">
          {errorMessage(start.error)}
        </p>
      )}
      <Button size="lg" block className="mt-3" icon={<Lock size={18} aria-hidden />} loading={leaving} onClick={() => start.mutate(quote.request)}>
        {leaving ? 'Opening checkout…' : catalog.sandbox ? `Pay ${quote.price} (test)` : `Pay ${quote.price} with ${wallet ?? 'Flutterwave'}`}
      </Button>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-on-ink-soft">
        <ShieldCheck size={14} aria-hidden />
        {catalog.sandbox
          ? 'Test checkout: no real money moves.'
          : dollars
            ? `${wallet ? `Pay with ${wallet} on Flutterwave’s secure page` : 'International cards are charged in dollars by Flutterwave'}. You come straight back here.`
            : 'Pay by card, bank transfer or USSD on Flutterwave’s secure page. You come straight back here.'}
      </p>
    </section>
  );
}
