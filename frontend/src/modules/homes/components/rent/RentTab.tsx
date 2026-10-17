'use client';

import { SearchX, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  CITIES,
  DISTRICTS,
  HOUSING_TYPE_IDS,
  type DistrictId,
  type HousingTypeId,
  type RentalListingDto,
} from '@insidelife/shared';
import { Badge, Button, EmptyState, Money } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { useListings } from '../../hooks/use-housing';
import { useHomesCity } from '../../hooks/use-homes-city';
import { filterListings, looksSuspicious, marketLabel, vsMarket } from '../../services/homes-rules';
import { FilterChips } from '@/common/components';
import { ErrorState, LoadingRows } from '@/common/components';
import { SelectField } from '@/common/components';
import { ListingSheet } from './ListingSheet';

const SHORT_TYPE: Record<HousingTypeId, string> = {
  'face-me': 'Face-me',
  'self-contain': 'Self-con',
  'mini-flat': 'Mini flat',
  'two-bed': '2-bed',
  'three-bed': '3-bed',
  duplex: 'Duplex',
  mansion: 'Mansion',
};

/** This week's rentals: filter by district and type; every card shows rent, the day-one total and how it compares. */
export function RentTab() {
  const { cityId } = useHomesCity();
  const query = useListings(cityId);
  const [district, setDistrict] = useState<DistrictId | 'all'>('all');
  const [type, setType] = useState<HousingTypeId | 'all'>('all');
  const [affordableOnly, setAffordableOnly] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const listings = useMemo(() => query.data ?? [], [query.data]);
  const visible = useMemo(
    () => filterListings(listings, { district, type, affordableOnly }),
    [listings, district, type, affordableOnly],
  );

  if (query.isPending) return <LoadingRows rows={5} />;
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
            ...CITIES[cityId].districtIds.map((id) => ({ value: id, label: DISTRICTS[id].name })),
          ]}
        />
        <FilterChips
          label="Type of place"
          value={type}
          onChange={setType}
          options={[
            { id: 'all', label: 'Any type' },
            ...HOUSING_TYPE_IDS.map((id) => ({ id, label: SHORT_TYPE[id] })),
          ]}
        />
        <FilterChips
          label="Budget"
          value={affordableOnly ? 'afford' : 'any'}
          onChange={(value) => setAffordableOnly(value === 'afford')}
          options={[
            { id: 'afford', label: 'What I can afford' },
            { id: 'any', label: 'Everything' },
          ]}
        />
        <p className="text-xs text-text-soft">
          Listings change every game week. Day one = a year’s rent + agency 10% + legal 10% + caution 10%.
        </p>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No places match"
          body={
            affordableOnly
              ? 'Nothing you can afford with these filters. Try another district or a smaller place.'
              : 'Nothing listed for this district and type this week.'
          }
          action={
            <Button
              variant="paper"
              onClick={() => (affordableOnly ? setAffordableOnly(false) : setType('all'))}
            >
              {affordableOnly ? 'Show everything' : 'Any type'}
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {visible.map((listing) => (
            <ListingRow key={listing.id} listing={listing} onOpen={() => setOpenId(listing.id)} />
          ))}
        </ul>
      )}
      <ListingSheet listing={selected} onClose={() => setOpenId(null)} />
    </div>
  );
}

function ListingRow({
  listing,
  onOpen,
}: {
  readonly listing: RentalListingDto;
  readonly onOpen: () => void;
}) {
  const delta = vsMarket(listing);
  const suspicious = looksSuspicious(listing);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-col gap-2 rounded-card bg-paper-2 p-3.5 text-left ring-1 ring-transparent hover:ring-line"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-bold">{listing.typeLabel}</p>
            <p className="truncate text-sm text-text-soft">
              {listing.street}, {listing.districtName}
            </p>
          </div>
          <p className="shrink-0 text-right leading-tight">
            <Money amount={listing.annualRent} compact className="type-figure text-lg" />
            <span className="block text-2xs font-bold text-text-soft">a year</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={delta <= -0.05 ? 'good' : delta >= 0.05 ? 'warn' : 'neutral'}>
            {marketLabel(listing)}
          </Badge>
          {suspicious && (
            <Badge tone="bad">
              <ShieldAlert size={12} aria-hidden />
              Scam risk
            </Badge>
          )}
          <Badge>
            {listing.bedrooms} bed · {Math.round(listing.gridHours)}h light
          </Badge>
        </div>
        <p className={cn('text-sm', listing.affordable ? 'text-text-soft' : 'text-okada')}>
          Day one: <Money amount={listing.upfront.total} className="font-bold text-text" />
          {!listing.affordable && ' — more than you have'}
        </p>
      </button>
    </li>
  );
}
