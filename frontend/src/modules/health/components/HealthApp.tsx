'use client';

import { useState } from 'react';
import { Tabs } from '@/common/components';
import { useGameMinute } from '@/common/game/use-game-clock';
import { useUi } from '@/common/game/ui-store';
import { useHealth } from '../hooks/use-health';
import { activeIllnesses } from '../services/health-rules';
import { ClinicsTab } from './clinics/ClinicsTab';
import { HistoryTab } from './history/HistoryTab';
import { HmoTab } from './hmo/HmoTab';
import { ErrorState, LoadingRows } from '@/common/components';
import { MeTab } from './me/MeTab';

type HealthTab = 'me' | 'clinics' | 'hmo' | 'history';
const TABS: readonly HealthTab[] = ['me', 'clinics', 'hmo', 'history'];
const LABELS: Record<HealthTab, string> = {
  me: 'My health',
  clinics: 'Clinics',
  hmo: 'HMO',
  history: 'History',
};
const isTab = (value: string | null): value is HealthTab =>
  value !== null && (TABS as readonly string[]).includes(value);

/** Health phone app: vitals and conditions with treatment quotes, clinics and check-ups, HMO plans, medical file. */
export function HealthApp() {
  const deepLink = useUi((state) => state.phoneParam);
  const [tab, setTab] = useState<HealthTab>(isTab(deepLink) ? deepLink : 'me');
  const query = useHealth();
  const now = useGameMinute(15_000);
  const ill = query.data ? activeIllnesses(query.data.conditions).length : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-5 bg-paper px-5 pb-2">
        <Tabs
          label="Health"
          value={tab}
          onChange={setTab}
          items={TABS.map((id) => ({ id, label: LABELS[id], badge: id === 'me' ? ill : undefined }))}
        />
      </div>
      <div role="tabpanel" aria-label={LABELS[tab]}>
        {query.isPending ? (
          <LoadingRows />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : tab === 'me' ? (
          <MeTab view={query.data} now={now} onCheckUp={() => setTab('clinics')} />
        ) : tab === 'clinics' ? (
          <ClinicsTab view={query.data} />
        ) : tab === 'hmo' ? (
          <HmoTab view={query.data} now={now} />
        ) : (
          <HistoryTab history={query.data.history} now={now} />
        )}
      </div>
    </div>
  );
}
