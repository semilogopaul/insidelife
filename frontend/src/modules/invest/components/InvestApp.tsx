'use client';

import { useState } from 'react';
import { errorMessage } from '@/common/api/api-error';
import { Button, Spinner, Tabs } from '@/common/components';
import { useUi } from '@/common/game/ui-store';
import { usePortfolio } from '../hooks/use-invest';
import { DepositsTab } from './deposits/DepositsTab';
import { DollarsTab } from './DollarsTab';
import { HoldingsTab } from './HoldingsTab';
import { InstrumentScreen } from './InstrumentScreen';
import { MarketsTab } from './MarketsTab';
import { PortfolioHeader } from './PortfolioHeader';

const TABS = [
  { id: 'markets', label: 'Markets' },
  { id: 'deposits', label: 'Savings' },
  { id: 'dollars', label: 'Dollars' },
  { id: 'holdings', label: 'Holdings' },
] as const;
type InvestTab = (typeof TABS)[number]['id'];

const isTab = (value: string | null): value is InvestTab => TABS.some((tab) => tab.id === value);

/**
 * Invest phone app: portfolio summary, then Markets (stocks + crypto with charts and trading), Savings (savings
 * account, T-bills, fixed deposits, money market), Dollars (FX desk) and Holdings. Deep link: `openPhone('invest', 'dollars')`.
 */
export function InvestApp() {
  const param = useUi((state) => state.phoneParam);
  const [tab, setTab] = useState<InvestTab>(() => (isTab(param) ? param : 'markets'));
  const [instrument, setInstrument] = useState<string | null>(null);
  const portfolio = usePortfolio();

  if (instrument) return <InstrumentScreen instrumentId={instrument} onBack={() => setInstrument(null)} />;

  return (
    <div className="flex flex-col gap-4 pb-2">
      {portfolio.data ? (
        <PortfolioHeader portfolio={portfolio.data} />
      ) : portfolio.isError ? (
        <div className="rounded-sheet bg-okada-soft p-4 text-sm">
          <p className="font-bold text-okada">Couldn’t load your portfolio</p>
          <p className="mt-1 text-text-soft">{errorMessage(portfolio.error)}</p>
          <Button variant="paper" size="sm" className="mt-2" onClick={() => void portfolio.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <div aria-label="Loading portfolio" className="h-47.5 animate-pulse rounded-sheet bg-ink/90" />
      )}
      <Tabs items={TABS} value={tab} onChange={setTab} label="Invest sections" className="sticky top-0 z-10 -mx-5 bg-paper px-5 py-2" />
      <div role="tabpanel" aria-label={TABS.find((item) => item.id === tab)?.label}>
        {tab === 'markets' ? (
          <MarketsTab onOpen={setInstrument} />
        ) : !portfolio.data ? (
          <div className="grid place-items-center py-10 text-text-soft">
            <Spinner />
          </div>
        ) : tab === 'deposits' ? (
          <DepositsTab portfolio={portfolio.data} />
        ) : tab === 'dollars' ? (
          <DollarsTab portfolio={portfolio.data} />
        ) : (
          <HoldingsTab portfolio={portfolio.data} onOpen={setInstrument} onBrowse={() => setTab('markets')} />
        )}
      </div>
    </div>
  );
}
