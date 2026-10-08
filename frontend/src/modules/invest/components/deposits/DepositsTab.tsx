'use client';

import { ChevronDown, PiggyBank } from 'lucide-react';
import { useState } from 'react';
import { formatPercent, type DepositProductId, type PortfolioDto } from '@insidelife/shared';
import { Button, Money, Section } from '@/common/components';
import { useUi } from '@/common/game/ui-store';
import { cn } from '@/common/utils/cn';
import { DEPOSIT_EXPLAINERS } from '../../services/invest-math';
import { DepositForm } from './DepositForm';
import { DepositRow } from './DepositRow';

const ORDER: readonly DepositProductId[] = ['tbill', 'fixed-deposit', 'money-market'];

/** Savings account, today's fixed-income offers (with plain explanations) and your open deposits. */
export function DepositsTab({ portfolio }: { readonly portfolio: PortfolioDto }) {
  const openPhone = useUi((state) => state.openPhone);
  const [expanded, setExpanded] = useState<DepositProductId | null>(null);
  const offers = [...portfolio.offers].sort((a, b) => ORDER.indexOf(a.product) - ORDER.indexOf(b.product));
  const open = portfolio.deposits.filter((deposit) => deposit.status === 'active' || deposit.status === 'matured');

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Savings account" className="rounded-sheet bg-naira-soft p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-naira text-white">
            <PiggyBank size={22} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Savings account</p>
            <p className="type-figure text-2xl leading-tight">
              <Money amount={portfolio.savings.balance} />
            </p>
          </div>
          <Button variant="paper" size="sm" onClick={() => openPhone('bank', 'savings')}>
            Move money
          </Button>
        </div>
        <p className="mt-2 text-xs text-text-soft">
          Earning {formatPercent(portfolio.savings.annualRate, 2)} a year. <Money amount={portfolio.savings.accruedInterest} /> interest so far this month, paid at month end
          after 10% tax. Withdraw any time, no charge.
        </p>
      </section>

      <Section title="Put money to work" aside={<span className="text-xs">Rates change with the economy</span>}>
        <ul className="flex flex-col gap-2.5">
          {offers.map((offer) => {
            const best = Math.max(...offer.rates.map((entry) => entry.annualRate));
            const isOpen = expanded === offer.product;
            const copy = DEPOSIT_EXPLAINERS[offer.product];
            return (
              <li key={offer.product} className={cn('rounded-sheet p-4 ring-1 transition-colors', isOpen ? 'bg-paper-2 ring-ink/20' : 'bg-paper ring-line')}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setExpanded(isOpen ? null : offer.product)}
                  className="flex w-full items-start gap-3 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="type-title block text-lg leading-tight">{copy.title}</span>
                    <span className="mt-0.5 block text-sm text-text-soft">{copy.line}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-2xs font-bold text-text-soft">{offer.rates.length > 1 ? 'up to' : 'about'}</span>
                    <span className="type-figure block text-xl text-naira">{formatPercent(best, 2)}</span>
                    <ChevronDown size={18} aria-hidden className={cn('ml-auto text-text-faint transition-transform', isOpen && 'rotate-180')} />
                  </span>
                </button>
                {isOpen && <DepositForm offer={offer} cash={portfolio.cash} onDone={() => setExpanded(null)} />}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Your deposits">
        {open.length === 0 ? (
          <p className="text-sm text-text-soft">No open deposits. A 91-day T-bill is a gentle place to start.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {open.map((deposit) => (
              <DepositRow key={deposit.id} deposit={deposit} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
