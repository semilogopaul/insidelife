'use client';

import { useState } from 'react';
import { Tabs } from '@/common/components';
import { useGameMinute } from '@/common/game/use-game-clock';
import { useUi } from '@/common/game/ui-store';
import { useVehicles } from '../hooks/use-vehicles';
import { DealerTab } from './dealer/DealerTab';
import { GarageTab } from './garage/GarageTab';
import { ErrorState, LoadingRows } from '@/common/components';
import { LicenceTab } from './licence/LicenceTab';

type MotorsTab = 'garage' | 'dealer' | 'licence';
const TABS: readonly MotorsTab[] = ['garage', 'dealer', 'licence'];
const LABELS: Record<MotorsTab, string> = { garage: 'My garage', dealer: 'Buy a car', licence: 'Licence' };
const isTab = (value: string | null): value is MotorsTab =>
  value !== null && (TABS as readonly string[]).includes(value);

/** Motors phone app: your cars, the dealers' lots and your FRSC licence. Deep link: openPhone('motors', '<tab>'). */
export function MotorsApp() {
  const deepLink = useUi((state) => state.phoneParam);
  const query = useVehicles();
  const [chosen, setChosen] = useState<MotorsTab | null>(isTab(deepLink) ? deepLink : null);
  const now = useGameMinute(15_000);
  const tab: MotorsTab = chosen ?? (query.data?.atDealer ? 'dealer' : 'garage');

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-5 bg-paper px-5 pb-2">
        <Tabs
          label="Motors"
          value={tab}
          onChange={setChosen}
          items={TABS.map((id) => ({
            id,
            label: LABELS[id],
            badge: id === 'garage' ? query.data?.mine.length : undefined,
          }))}
        />
      </div>
      <div role="tabpanel" aria-label={LABELS[tab]}>
        {query.isPending ? (
          <LoadingRows />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : tab === 'garage' ? (
          <GarageTab data={query.data} now={now} onShop={() => setChosen('dealer')} />
        ) : tab === 'dealer' ? (
          <DealerTab data={query.data} />
        ) : (
          <LicenceTab data={query.data} now={now} />
        )}
      </div>
    </div>
  );
}
