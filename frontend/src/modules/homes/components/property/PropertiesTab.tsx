'use client';

import { LandPlot } from 'lucide-react';
import { useState } from 'react';
import type { GameMinute, HousingOverviewDto, PropertyDto } from '@insidelife/shared';
import { Button, EmptyState, Money, StatTile } from '@/common/components';
import { BuildSheet } from './BuildSheet';
import { PropertyCard } from './PropertyCard';

/** Land and buildings you own: value, builds in progress, tenants, sales. */
export function PropertiesTab({
  overview,
  now,
  onBuyLand,
  onBuyHouse,
}: {
  readonly overview: HousingOverviewDto;
  readonly now: GameMinute;
  readonly onBuyLand: () => void;
  readonly onBuyHouse: () => void;
}) {
  const [building, setBuilding] = useState<PropertyDto | null>(null);
  const properties = overview.properties.filter(
    (property) => property.status !== 'sold' && property.status !== 'lost',
  );

  if (properties.length === 0) {
    return (
      <EmptyState
        icon={LandPlot}
        title="No land yet"
        body="Land in Lagos only goes up — if your papers are right. Start with a plot in Epe or Ikorodu, or buy a finished house and move in today."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={onBuyLand}>See land for sale</Button>
            <Button variant="paper" onClick={onBuyHouse}>
              Houses for sale
            </Button>
          </div>
        }
      />
    );
  }

  const rentRoll = properties.reduce((sum, property) => sum + (property.building?.annualRentRoll ?? 0), 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <StatTile
          tone="ink"
          label="Portfolio"
          value={<Money amount={overview.portfolioValue} compact />}
          hint={`${properties.length} propert${properties.length === 1 ? 'y' : 'ies'}`}
        />
        <StatTile
          label="Rent coming in"
          value={<Money amount={rentRoll} compact />}
          hint="A year, from tenants"
        />
      </div>
      <ul className="flex flex-col gap-3">
        {properties.map((property) => (
          <PropertyCard
            key={property.id}
            property={property}
            now={now}
            onBuild={() => setBuilding(property)}
          />
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="paper" onClick={onBuyLand}>
          Buy more land
        </Button>
        <Button variant="paper" onClick={onBuyHouse}>
          Buy a house
        </Button>
      </div>
      <BuildSheet property={building} onClose={() => setBuilding(null)} />
    </div>
  );
}
