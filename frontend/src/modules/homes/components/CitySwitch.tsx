'use client';

import { CITIES, CITY_IDS } from '@insidelife/shared';
import { FilterChips } from '@/common/components';
import { useHomesCity } from '../hooks/use-homes-city';

/** Rentals, houses and land are per city: browse either; you can only sign a lease in the city you are in. */
export function CitySwitch() {
  const { cityId, here, setCityId } = useHomesCity();
  return (
    <div className="flex flex-col gap-1.5" data-testid="homes-city-switch">
      <FilterChips label="City" value={cityId} onChange={setCityId} options={CITY_IDS.map((id) => ({ id, label: id === here ? `${CITIES[id].name} (you are here)` : CITIES[id].name }))} />
      {cityId !== here && (
        <p className="text-xs text-text-soft">
          You are in {CITIES[here].name}. Browse {CITIES[cityId].name} freely, but fly or take the bus there before you sign a lease.
        </p>
      )}
    </div>
  );
}
