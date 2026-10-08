'use client';

import { useState } from 'react';
import type { BusinessTypeDto } from '@insidelife/shared';
import { Badge, Money, Section } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { useBusinesses } from '../../hooks/use-jobs-data';
import { NextStep } from '@/common/components';
import { ErrorState, LoadingRows } from '@/common/components';
import { BusinessCard } from './BusinessCard';
import { RISK_BADGE } from './business-labels';
import { StartBusinessSheet } from './StartBusinessSheet';

/** Be your own oga: your businesses with P&L, then the catalogue to start another. */
export function BusinessTab() {
  const query = useBusinesses();
  const [starting, setStarting] = useState<BusinessTypeDto | null>(null);
  if (query.isPending) return <LoadingRows />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const { catalogue, mine, maxBusinesses } = query.data;
  const active = mine.filter((business) => business.status === 'active');
  const full = active.length >= maxBusinesses;
  const starter = catalogue.filter((type) => type.affordable).sort((a, b) => a.capital - b.capital)[0];

  return (
    <div className="flex flex-col gap-6">
      {mine.length === 0 && (
        <NextStep
          kicker="Be your own oga"
          title="Start small, grow am"
          body={
            starter ? (
              <>
                A {starter.label.toLowerCase()} costs{' '}
                <Money amount={starter.capital} compact className="font-bold text-on-ink" /> to start. Profit
                lands every month end — if you manage it well.
              </>
            ) : (
              'Save up some capital: the cheapest businesses start from a few hundred thousand naira.'
            )
          }
        />
      )}

      {mine.length > 0 && (
        <Section title="Your businesses" aside={`${active.length} of ${maxBusinesses}`}>
          <ul className="flex flex-col gap-3">
            {mine.map((business) => (
              <BusinessCard key={business.id} business={business} />
            ))}
          </ul>
        </Section>
      )}

      <Section
        title="Start a business"
        aside={full ? 'Sell or close one first' : 'Capital at today’s prices'}
      >
        <ul className="-mx-2 flex flex-col divide-y divide-line px-2">
          {catalogue.map((type) => {
            const risk = RISK_BADGE[type.risk];
            return (
              <li key={type.id}>
                <button
                  type="button"
                  disabled={full}
                  onClick={() => setStarting(type)}
                  className={cn(
                    'flex w-full items-start gap-3 py-3 text-left hover:bg-paper-2/60 disabled:opacity-50',
                  )}
                >
                  <span
                    aria-hidden
                    className="grid size-11 shrink-0 place-items-center rounded-card bg-paper-2 text-2xl"
                  >
                    {type.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-bold">{type.label}</span>
                      <Money
                        amount={type.capital}
                        compact
                        className={cn('shrink-0 font-bold', !type.affordable && 'text-text-faint')}
                      />
                    </span>
                    <span className="block text-sm text-text-soft">
                      Typical month <Money amount={type.typicalMonthlyProfit.low} compact signed /> to{' '}
                      <Money amount={type.typicalMonthlyProfit.high} compact signed />
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      <Badge tone={risk.tone}>{risk.label}</Badge>
                      {!type.affordable && <Badge>Need more capital</Badge>}
                      {type.minAge > 17 && <Badge>{type.minAge}+</Badge>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Section>
      <StartBusinessSheet type={starting} onClose={() => setStarting(null)} />
    </div>
  );
}
