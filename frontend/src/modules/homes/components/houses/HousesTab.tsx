'use client';

import { KeyRound, SearchX } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  CITIES,
  DISTRICTS,
  LAND_TITLES,
  type BlueprintId,
  type DistrictId,
  type HouseListingDto,
} from '@insidelife/shared';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  FilterChips,
  LoadingRows,
  Money,
  SelectField,
} from '@/common/components';
import { cn } from '@/common/utils/cn';
import { useHouseListings } from '../../hooks/use-housing';
import { useHomesCity } from '../../hooks/use-homes-city';
import { filterHouses, houseCondition } from '../../services/homes-rules';
import { HouseSheet } from './HouseSheet';

const KINDS: readonly { readonly id: BlueprintId | 'all'; readonly label: string }[] = [
  { id: 'all', label: 'Any house' },
  { id: 'bungalow', label: 'Bungalow' },
  { id: 'duplex', label: 'Duplex' },
  { id: 'block-of-flats', label: 'Flats' },
  { id: 'mansion', label: 'Mansion' },
];

/** Ready-built houses for sale this week: pay once, get the keys, move in or let it out. */
export function HousesTab({ onSeeProperty }: { readonly onSeeProperty: () => void }) {
  const { cityId } = useHomesCity();
  const query = useHouseListings(cityId);
  const listings = useMemo(() => query.data ?? [], [query.data]);
  const districts = useMemo(() => [...new Set(listings.map((listing) => listing.districtId))], [listings]);
  const [district, setDistrict] = useState<DistrictId | 'all'>('all');
  const [blueprint, setBlueprint] = useState<BlueprintId | 'all'>('all');
  const [affordableOnly, setAffordableOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const visible = useMemo(
    () => filterHouses(listings, { district, blueprint, affordableOnly }),
    [listings, district, blueprint, affordableOnly],
  );

  if (query.isPending) return <LoadingRows rows={4} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const selected = listings.find((listing) => listing.id === openId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5">
        <SelectField
          label="District"
          hideLabel
          value={district}
          onChange={setDistrict}
          options={[
            { value: 'all', label: `All of ${CITIES[cityId].name}` },
            ...districts.map((id) => ({ value: id, label: DISTRICTS[id].name })),
          ]}
        />
        <FilterChips
          label="Kind of house"
          value={blueprint}
          onChange={setBlueprint}
          options={KINDS.map((kind) => ({ id: kind.id, label: kind.label }))}
        />
        <FilterChips
          label="Budget"
          value={affordableOnly ? 'afford' : 'any'}
          onChange={(value) => setAffordableOnly(value === 'afford')}
          options={[
            { id: 'any', label: 'Everything' },
            { id: 'afford', label: 'What I can afford' },
          ]}
        />
        <p className="text-xs text-text-soft">
          Finished houses you can move into today — new ones every game week. The price covers house and land;
          agency 5% + legal 2.5% + survey 1.5% come on top.
        </p>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No houses match"
          body={
            affordableOnly
              ? 'Nothing you can afford with these filters yet. Buy a plot and build — you pay the contractor in stages.'
              : 'Nothing of that kind for sale in this district this week.'
          }
          action={
            <Button
              variant="paper"
              onClick={() => (affordableOnly ? setAffordableOnly(false) : setBlueprint('all'))}
            >
              {affordableOnly ? 'Show everything' : 'Any house'}
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {visible.map((listing) => (
            <HouseRow key={listing.id} listing={listing} onOpen={() => setOpenId(listing.id)} />
          ))}
        </ul>
      )}
      <HouseSheet listing={selected} onClose={() => setOpenId(null)} onSeeProperty={onSeeProperty} />
    </div>
  );
}

function HouseRow({ listing, onOpen }: { readonly listing: HouseListingDto; readonly onOpen: () => void }) {
  const condition = houseCondition(listing.condition);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-col gap-2 rounded-card bg-paper-2 p-3.5 text-left ring-1 ring-transparent hover:ring-line"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-bold">{listing.blueprintLabel}</p>
            <p className="truncate text-sm text-text-soft">
              {listing.label}, {listing.districtName}
            </p>
          </div>
          <p className="shrink-0 text-right leading-tight">
            <Money amount={listing.price} compact className="type-figure text-lg" />
            <span className="block text-2xs font-bold text-text-soft">asking</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {listing.bought && (
            <Badge tone="info">
              <KeyRound size={12} aria-hidden />
              Yours
            </Badge>
          )}
          <Badge tone={listing.title === 'c-of-o' ? 'good' : listing.title === 'survey' ? 'bad' : 'warn'}>
            {LAND_TITLES[listing.title].shortLabel}
          </Badge>
          <Badge tone={condition.tone}>
            {condition.label} · {listing.condition}/100
          </Badge>
          <Badge>
            {listing.units > 1 ? `${listing.units} flats` : `${listing.bedrooms} bed`} · {listing.plots} plot
            {listing.plots === 1 ? '' : 's'}
          </Badge>
        </div>
        <p className={cn('text-sm', listing.affordable || listing.bought ? 'text-text-soft' : 'text-okada')}>
          With fees: <Money amount={listing.total} className="font-bold text-text" />
          {!listing.affordable && !listing.bought && ' — more than you have'}
        </p>
      </button>
    </li>
  );
}
