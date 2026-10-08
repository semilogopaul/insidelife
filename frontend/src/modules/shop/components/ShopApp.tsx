'use client';

import { useState } from 'react';
import { SHOP_CATEGORIES, type ShopCategory } from '@insidelife/shared';
import { Tabs } from '@/common/components';
import { useGameMinute } from '@/common/game/use-game-clock';
import { useUi } from '@/common/game/ui-store';
import { useInventory } from '../hooks/use-shop';
import { ShopTab } from './store/ShopTab';
import { StuffTab } from './stuff/StuffTab';
import { WardrobeTab } from './wardrobe/WardrobeTab';

type ShopAppTab = 'shop' | 'stuff' | 'wardrobe';
const LABELS: Record<ShopAppTab, string> = { shop: 'Shop', stuff: 'My stuff', wardrobe: 'Wardrobe' };
const isCategory = (value: string | null): value is ShopCategory =>
  value !== null && (SHOP_CATEGORIES as readonly string[]).includes(value);

/**
 * Shop phone app: catalogue (in store or delivered), your belongings, and the wardrobe.
 * Deep links: openPhone('shop', '<category>') or openPhone('shop', 'wardrobe').
 */
export function ShopApp() {
  const deepLink = useUi((state) => state.phoneParam);
  const [tab, setTab] = useState<ShopAppTab>(
    deepLink === 'wardrobe' ? 'wardrobe' : deepLink === 'stuff' ? 'stuff' : 'shop',
  );
  const [category, setCategory] = useState<ShopCategory>(isCategory(deepLink) ? deepLink : 'furniture');
  const inventory = useInventory();
  const now = useGameMinute(15_000);
  const deliveries = inventory.data?.deliveries.length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-5 bg-paper px-5 pb-2">
        <Tabs
          label="Shop"
          value={tab}
          onChange={setTab}
          items={(['shop', 'stuff', 'wardrobe'] as const).map((id) => ({
            id,
            label: LABELS[id],
            badge: id === 'stuff' ? deliveries : undefined,
          }))}
        />
      </div>
      <div role="tabpanel" aria-label={LABELS[tab]}>
        {tab === 'shop' && <ShopTab key={category} initialCategory={category} />}
        {tab === 'stuff' && (
          <StuffTab
            now={now}
            onShop={() => {
              setCategory('furniture');
              setTab('shop');
            }}
          />
        )}
        {tab === 'wardrobe' && (
          <WardrobeTab
            onShopClothes={() => {
              setCategory('clothing');
              setTab('shop');
            }}
          />
        )}
      </div>
    </div>
  );
}
