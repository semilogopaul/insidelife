'use client';

import { useState } from 'react';
import { ErrorState, LoadingRows, Tabs } from '@/common/components';
import { useGameMinute } from '@/common/game/use-game-clock';
import { useUi } from '@/common/game/ui-store';
import { useHangar } from '../hooks/use-hangar';
import { BuyTab } from './buy/BuyTab';
import { FleetTab } from './fleet/FleetTab';
import { LicenceTab } from './licence/LicenceTab';

type HangarTab = 'fleet' | 'buy' | 'licence';
const TABS: readonly HangarTab[] = ['fleet', 'buy', 'licence'];
const LABELS: Record<HangarTab, string> = { fleet: 'My fleet', buy: 'Buy aircraft', licence: 'Pilot licence' };
const isTab = (value: string | null): value is HangarTab => value !== null && (TABS as readonly string[]).includes(value);

/**
 * Hangar phone app: your aircraft (fly, livery editor, name and registration), the aircraft sales desk and your Private
 * Pilot Licence. Deep link: openPhone('hangar', 'fleet' | 'buy' | 'licence') from the GAT's desks.
 */
export function HangarApp() {
  const deepLink = useUi((state) => state.phoneParam);
  const query = useHangar();
  const [chosen, setChosen] = useState<HangarTab | null>(isTab(deepLink) ? deepLink : null);
  const now = useGameMinute(15_000);
  const tab: HangarTab = chosen ?? 'fleet';

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-5 bg-paper px-5 pb-2">
        <Tabs
          label="Hangar"
          value={tab}
          onChange={setChosen}
          items={TABS.map((id) => ({ id, label: LABELS[id], badge: id === 'fleet' ? query.data?.mine.length : undefined }))}
        />
      </div>
      <div role="tabpanel" aria-label={LABELS[tab]}>
        {query.isPending ? (
          <LoadingRows />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : tab === 'fleet' ? (
          <FleetTab data={query.data} now={now} onShop={() => setChosen('buy')} />
        ) : tab === 'buy' ? (
          <BuyTab data={query.data} />
        ) : (
          <LicenceTab data={query.data} now={now} />
        )}
      </div>
    </div>
  );
}
