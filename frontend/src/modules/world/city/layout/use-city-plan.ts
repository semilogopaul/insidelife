'use client';

import { useMemo } from 'react';
import { useSnapshot } from '@/common/game/snapshot';
import { ownedLots, withOwnedLots, type OwnedLot } from './owned-lots';
import { cityPlan, type CityPlan } from './placements';

const NONE: readonly OwnedLot[] = [];

/** Your land and houses on their city lots (none without a session). Stable across unrelated snapshot updates. */
export function useOwnedLots(): readonly OwnedLot[] {
  const { data: snapshot } = useSnapshot();
  const properties = snapshot?.summary.properties;
  return useMemo(() => (properties && properties.length > 0 ? ownedLots(properties) : NONE), [properties]);
}

/** The city plan as this player sees it: their own plots cleared and rebuilt (see `withOwnedLots`). */
export function useCityPlan(): CityPlan {
  const owned = useOwnedLots();
  return useMemo(() => withOwnedLots(cityPlan(), owned), [owned]);
}
