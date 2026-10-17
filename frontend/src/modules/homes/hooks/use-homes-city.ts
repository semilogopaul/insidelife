'use client';

import { create } from 'zustand';
import type { CityId } from '@insidelife/shared';
import { useSnapshot } from '@/common/game/snapshot';

const useChoice = create<{ readonly cityId: CityId | null; readonly set: (cityId: CityId) => void }>((set) => ({ cityId: null, set: (cityId) => set({ cityId }) }));

/** Which city's rentals, houses and land the Homes app shows: the one you picked, else the one you are in. */
export function useHomesCity(): { readonly cityId: CityId; readonly here: CityId; readonly setCityId: (cityId: CityId) => void } {
  const { data: snapshot } = useSnapshot();
  const choice = useChoice((state) => state.cityId);
  const here = snapshot?.character.cityId ?? 'lagos';
  return { cityId: choice ?? here, here, setCityId: useChoice.getState().set };
}
