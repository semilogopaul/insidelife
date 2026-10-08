'use client';

import { FlaskConical, Lock, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { findTopupPackage, formatNaira, type TopupPackage } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Badge, Button, Money, ProgressBar, Section, Spinner } from '@/common/components';
import { useStartTopup, useTopupCatalog } from '../../hooks/use-topups';
import { ScreenHeader } from '../ScreenHeader';
import { PackageCard } from './PackageCard';
import { PaymentHistory } from './PaymentHistory';

/** Buy in-game naira with real naira through Paystack. Prices in real naira, daily cap shown, purchased money labelled. */
export function TopUpScreen({ onBack }: { readonly onBack: () => void }) {
  const catalog = useTopupCatalog();
  const start = useStartTopup();
  const [selected, setSelected] = useState<TopupPackage | null>(null);
  const leaving = start.isPending || start.isSuccess;

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
          <div className="rounded-card bg-paper-2 p-3.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-bold">Left to top up today</span>
              <span className="type-figure">
                <Money amount={catalog.data.remainingTodayNgn} />
              </span>
            </div>
            <ProgressBar value={catalog.data.spentTodayNgn} max={catalog.data.dailyLimitNgn} label="Today’s top-up cap used" tone="ink" className="mt-2" />
            <p className="mt-1.5 text-xs text-text-soft">
              Real money is capped at {formatNaira(catalog.data.dailyLimitNgn)} a day. Bought naira is labelled and never counts toward the self-made rich list.
            </p>
          </div>

          <ul className="grid grid-cols-2 gap-2.5" aria-label="Top-up packs">
            {catalog.data.packages.map((pack) => (
              <li key={pack.id}>
                <PackageCard
                  pack={pack}
                  selected={selected?.id === pack.id}
                  disabledReason={pack.priceNgn > catalog.data.remainingTodayNgn ? 'Over today’s cap' : null}
                  onSelect={() => {
                    start.reset();
                    setSelected(pack);
                  }}
                />
              </li>
            ))}
          </ul>

          {selected && (
            <section aria-label="Confirm top-up" className="sticky bottom-0 -mx-1 rounded-sheet bg-ink p-4 text-on-ink shadow-[var(--shadow-lift)]">
              <p className="text-sm text-on-ink-soft">
                You pay <strong className="text-white">{formatNaira(selected.priceNgn)}</strong> real money and get{' '}
                <strong className="text-danfo">{formatNaira(selected.virtualAmount)}</strong> in your game wallet.
              </p>
              {start.isError && (
                <p role="alert" className="mt-2 rounded-chip bg-okada/20 p-2 text-sm text-white">
                  {errorMessage(start.error)}
                </p>
              )}
              <Button size="lg" block className="mt-3" icon={<Lock size={18} aria-hidden />} loading={leaving} onClick={() => start.mutate(selected.id)}>
                {leaving ? 'Opening checkout…' : catalog.data.sandbox ? `Pay ${formatNaira(selected.priceNgn)} (test)` : `Pay ${formatNaira(selected.priceNgn)} with Paystack`}
              </Button>
              <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-on-ink-soft">
                <ShieldCheck size={14} aria-hidden />
                {catalog.data.sandbox ? 'Test checkout: no real money moves.' : 'Card details stay with Paystack. You come straight back here.'}
              </p>
            </section>
          )}
        </>
      )}

      <Section title="Payment history">
        <PaymentHistory
          onRetry={(payment) => {
            const pack = payment.topup ? findTopupPackage(payment.topup.packageId) : undefined;
            if (pack) {
              start.reset();
              setSelected(pack);
            }
          }}
        />
      </Section>
    </div>
  );
}
