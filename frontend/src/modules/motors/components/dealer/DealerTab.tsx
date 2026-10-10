'use client';

import { Fuel, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  VEHICLE_GRADE_LABELS,
  VEHICLE_PAINTS,
  findVenue,
  type VehicleCatalogEntryDto,
  type VehiclePaintId,
  type VehiclesDto,
} from '@insidelife/shared';
import { PlaceIcon } from '@/common/brand/place-icons';
import { Badge, Button, Money } from '@/common/components';
import { useSnapshot } from '@/common/game/snapshot';
import { filterCatalogue, type SegmentFilter } from '../../services/motors-rules';
import { CarArt } from '../CarArt';
import { MakeBadge } from '../MakeBadge';
import { FilterChips } from '@/common/components';
import { BuyCarSheet, type BuyChoice } from './BuyCarSheet';
import { PaintSwatches } from './PaintSwatches';
import { PerformanceBars } from './PerformanceBars';

const SEGMENTS: ReadonlyArray<{ readonly id: SegmentFilter; readonly label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'economy', label: 'Economy' },
  { id: 'family', label: 'Family' },
  { id: 'executive', label: 'Executive' },
  { id: 'luxury', label: 'Luxury' },
  { id: 'exotic', label: 'Exotic' },
  { id: 'commercial', label: 'Work' },
];

/** The lot: every car with price, street name, performance and paints; in person at a dealer or delivered. */
export function DealerTab({ data }: { readonly data: VehiclesDto }) {
  const { data: snapshot } = useSnapshot();
  const [segment, setSegment] = useState<SegmentFilter>('all');
  const [budgetOnly, setBudgetOnly] = useState(false);
  const [buying, setBuying] = useState<BuyChoice | null>(null);
  const balance = snapshot?.wallet.balance ?? null;
  // At a dealer, the cars on this lot come first; the rest can only be delivered from here.
  const cars = useMemo(() => {
    const list = filterCatalogue(data.catalogue, segment, budgetOnly ? balance : null);
    return data.atDealer ? [...list.filter((entry) => entry.buyHere), ...list.filter((entry) => !entry.buyHere)] : list;
  }, [data.catalogue, data.atDealer, segment, budgetOnly, balance]);
  const dealer = data.atDealer ? findVenue(data.atDealer) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-start gap-2.5 rounded-card bg-paper-2 p-3 text-sm">
        <PlaceIcon kind="car-dealer" size={28} decorative />
        <span>
          {dealer ? (
            <>
              You’re at <strong>{dealer.name}</strong> — cars on this lot drive off today with no delivery
              fee.
            </>
          ) : (
            'Buy in person at Berger Car Mart (Naija-used & tokunbo) or Lekki Auto Gallery (clean tokunbo & brand new) — or order delivery for a fee.'
          )}
        </span>
      </p>
      <FilterChips label="Kind of car" value={segment} onChange={setSegment} options={SEGMENTS} />
      <FilterChips
        label="Budget"
        value={budgetOnly ? 'budget' : 'any'}
        onChange={(value) => setBudgetOnly(value === 'budget')}
        options={[
          { id: 'any', label: 'Any price' },
          { id: 'budget', label: 'What I can afford' },
        ]}
      />
      {cars.length === 0 ? (
        <p className="rounded-card bg-paper-2 p-4 text-center text-sm text-text-soft">
          Nothing in this range. Danfo still dey.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {cars.map((entry) => (
            <CarCard key={entry.vehicle.id} entry={entry} atDealer={dealer !== undefined} onBuy={(paint) => setBuying({ entry, paint })} />
          ))}
        </ul>
      )}
      <BuyCarSheet choice={buying} onClose={() => setBuying(null)} />
    </div>
  );
}

function CarCard({
  entry,
  atDealer,
  onBuy,
}: {
  readonly entry: VehicleCatalogEntryDto;
  /** Standing in a dealer: a car that isn't on this lot can only be delivered. */
  readonly atDealer: boolean;
  readonly onBuy: (paint: VehiclePaintId) => void;
}) {
  const { vehicle } = entry;
  const [paint, setPaint] = useState<VehiclePaintId>(vehicle.defaultPaint);
  return (
    <li className="flex flex-col gap-3 rounded-card bg-paper-2 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <MakeBadge make={vehicle.make} className="mt-1" />
          <div className="min-w-0">
            <p className="type-slogan text-[1.6rem] text-ink">“{vehicle.nickname}”</p>
            <p className="truncate text-sm font-bold">{vehicle.name}</p>
          </div>
        </div>
        <p className="shrink-0 text-right leading-tight">
          <Money amount={entry.price} compact className="type-figure text-xl" />
          {entry.buyHere && <span className="block text-2xs font-bold text-naira">On this lot</span>}
          {!entry.buyHere && atDealer && <span className="block text-2xs font-bold text-text-soft">Delivery only here</span>}
        </p>
      </div>
      <div className="px-4">
        <CarArt model={vehicle.model} color={VEHICLE_PAINTS[paint].hex} />
      </div>
      <p className="text-sm text-text-soft">{vehicle.blurb}</p>
      <div className="flex flex-wrap gap-1.5">
        <Badge
          tone={vehicle.grade === 'brand-new' ? 'good' : vehicle.grade === 'tokunbo' ? 'info' : 'neutral'}
        >
          {VEHICLE_GRADE_LABELS[vehicle.grade]}
        </Badge>
        <Badge>
          <Users size={12} aria-hidden />
          {vehicle.seats} seats
        </Badge>
        <Badge>
          <Fuel size={12} aria-hidden />
          {vehicle.fuelEconomyKmPerLitre} km/L {vehicle.fuelType}
        </Badge>
        {vehicle.status > 0 && <Badge tone="ankara">+{vehicle.status} clout</Badge>}
      </div>
      <PerformanceBars performance={vehicle.performance} />
      <PaintSwatches
        label={`${vehicle.name} paint`}
        paints={vehicle.paints}
        value={paint}
        onChange={setPaint}
        fees={entry.paintFees}
      />
      <Button variant={entry.buyHere ? 'danfo' : 'ink'} onClick={() => onBuy(paint)}>
        {entry.buyHere ? 'Buy and drive off' : atDealer ? 'Order delivery' : 'Buy or order delivery'}
      </Button>
      {!entry.buyHere && atDealer && entry.dealerIds.length > 0 && (
        <p className="-mt-1.5 text-center text-xs text-text-soft">
          To drive it off today, buy it at {entry.dealerIds.map((id) => findVenue(id)?.name ?? id).join(' or ')}.
        </p>
      )}
    </li>
  );
}
