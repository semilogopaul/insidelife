'use client';

import { useState } from 'react';
import { Tabs } from '@/common/components';
import { useGameMinute } from '@/common/game/use-game-clock';
import { useUi } from '@/common/game/ui-store';
import { useHousing } from '../hooks/use-housing';
import { MyHomeTab } from './home/MyHomeTab';
import { ErrorState, LoadingRows } from '@/common/components';
import { HousesTab } from './houses/HousesTab';
import { LandTab } from './land/LandTab';
import { PropertiesTab } from './property/PropertiesTab';
import { RentTab } from './rent/RentTab';

type HomesTab = 'home' | 'rent' | 'houses' | 'land' | 'property';
const TABS: readonly HomesTab[] = ['home', 'rent', 'houses', 'land', 'property'];
const LABELS: Record<HomesTab, string> = {
  home: 'My home',
  rent: 'Rent',
  houses: 'Houses',
  land: 'Land',
  property: 'Property',
};
const isTab = (value: string | null): value is HomesTab =>
  value !== null && (TABS as readonly string[]).includes(value);

/** Homes phone app: where you live (comfort, NEPA, lease), rentals, houses and land for sale, and your property. Deep link: openPhone('homes', '<tab>'). */
export function HomesApp() {
  const deepLink = useUi((state) => state.phoneParam);
  const [tab, setTab] = useState<HomesTab>(isTab(deepLink) ? deepLink : 'home');
  const query = useHousing();
  const now = useGameMinute(15_000);
  const owned =
    query.data?.properties.filter((property) => property.status === 'owned' || property.status === 'selling')
      .length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-5 bg-paper px-5 pb-2">
        <Tabs
          label="Homes"
          value={tab}
          onChange={setTab}
          items={TABS.map((id) => ({ id, label: LABELS[id], badge: id === 'property' ? owned : undefined }))}
        />
      </div>
      <div role="tabpanel" aria-label={LABELS[tab]}>
        {tab === 'rent' ? (
          <RentTab />
        ) : tab === 'houses' ? (
          <HousesTab onSeeProperty={() => setTab('property')} />
        ) : tab === 'land' ? (
          <LandTab />
        ) : query.isPending ? (
          <LoadingRows />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : tab === 'home' ? (
          <MyHomeTab overview={query.data} now={now} onBrowseRentals={() => setTab('rent')} />
        ) : (
          <PropertiesTab
            overview={query.data}
            now={now}
            onBuyLand={() => setTab('land')}
            onBuyHouse={() => setTab('houses')}
          />
        )}
      </div>
    </div>
  );
}
