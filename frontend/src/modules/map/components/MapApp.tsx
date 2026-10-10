'use client';

import { useQuery } from '@tanstack/react-query';
import { Bike, Bus, Car, CarTaxiFront, Footprints, Navigation } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  DISTRICTS,
  VENUES,
  findVenue,
  formatGameDuration,
  homeLocationId,
  type OwnedPropertyMarkerDto,
  type TransportMode,
  type VenueDefinition,
  type VenueType,
} from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { PlaceIcon, propertyPlaceKind, venuePlaceKind } from '@/common/brand/place-icons';
import { queryKeys } from '@/common/api/query-keys';
import { Button, Money, Spinner, toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useNavigation } from '@/common/game/navigation-store';
import { useSnapshot, useSnapshotMutation } from '@/common/game/snapshot';
import { useUi } from '@/common/game/ui-store';
import { cn } from '@/common/utils/cn';
import { travelApi } from '../services/travel.api';

const CATEGORIES: ReadonlyArray<{ readonly label: string; readonly types: readonly VenueType[] }> = [
  // The landmarks first: they're what the "now live" announcement points players to.
  { label: 'Must see', types: ['mansion', 'private-jet', 'refinery'] },
  { label: 'Food', types: ['buka', 'restaurant'] },
  { label: 'School', types: ['campus', 'cbt-centre', 'school'] },
  { label: 'Work', types: ['office', 'government'] },
  { label: 'Health', types: ['hospital-public', 'hospital-private', 'pharmacy'] },
  { label: 'Shopping', types: ['market', 'mall', 'car-dealer', 'salon'] },
  { label: 'Fun', types: ['bar', 'club', 'beach', 'park', 'cinema', 'event-centre', 'gym'] },
  { label: 'Services', types: ['estate-agency', 'airport', 'motor-park', 'church', 'mosque'] },
];

const STAGE_LABEL: Readonly<Record<OwnedPropertyMarkerDto['stage'], string>> = {
  land: 'Your land',
  construction: 'Building site',
  built: 'Your house',
};

const MODE_ICON: Record<TransportMode, typeof Bus> = { walk: Footprints, okada: Bike, keke: CarTaxiFront, danfo: Bus, brt: Bus, bolt: CarTaxiFront, car: Car };

type Target = VenueDefinition | 'home';

/** A deep link (`openPhone('map', param)`): a venue id, `home` or `home:<id>` opens that destination directly. */
function targetFromParam(param: string | null): Target | null {
  if (!param) return null;
  if (param === 'home' || param.startsWith('home:')) return 'home';
  return findVenue(param) ?? null;
}

/** Pick a destination: start GPS (drive/walk yourself) or book a ride. */
export function MapApp() {
  const phoneParam = useUi((state) => state.phoneParam);
  const [category, setCategory] = useState(0);
  const [selected, setSelected] = useState<Target | null>(() => targetFromParam(phoneParam));
  // A new deep link while the Map is already open jumps to that place (adjusting state during render, not an effect).
  const [linkedParam, setLinkedParam] = useState(phoneParam);
  if (phoneParam !== linkedParam) {
    setLinkedParam(phoneParam);
    setSelected(targetFromParam(phoneParam));
  }
  const { data: snapshot } = useSnapshot();
  const venues = useMemo(() => VENUES.filter((venue) => !venue.regionId && CATEGORIES[category]!.types.includes(venue.type)), [category]);
  const setDestination = useNavigation((state) => state.setDestination);
  const closePhone = useUi((state) => state.closePhone);
  // Land and houses you own but don't live in (where you live is Home): GPS only, rides go to venues and home.
  const properties = (snapshot?.summary.properties ?? []).filter((property) => !property.livedIn);

  if (selected) return <Destination target={selected} onBack={() => setSelected(null)} homeId={snapshot ? homeLocationId(snapshot.character.id) : null} />;

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={() => setSelected('home')} className="flex items-center gap-3 rounded-card bg-paper-2 p-3 text-left hover:bg-paper-3">
        <PlaceIcon kind="home" size={40} decorative />
        <span>
          <span className="block font-bold">Home</span>
          <span className="text-sm text-text-soft">{snapshot ? DISTRICTS[snapshot.character.homeDistrictId].name : ''}</span>
        </span>
      </button>
      {properties.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Your properties">
          {properties.map((property) => (
            <li key={property.id}>
              <button
                type="button"
                onClick={() => {
                  setDestination(`property:${property.id}`, property.label);
                  gameEvents.emit('sfx', { id: 'ui-success' });
                  closePhone();
                }}
                className="flex w-full items-center gap-3 rounded-card bg-paper-2 p-3 text-left hover:bg-paper-3"
              >
                <PlaceIcon kind={propertyPlaceKind(property)} size={40} decorative />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{property.label}</span>
                  <span className="block truncate text-sm text-text-soft">
                    {STAGE_LABEL[property.stage]} · {DISTRICTS[property.districtId].name}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-text-soft">
                  <Navigation size={16} aria-hidden /> GPS
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Place categories">
        {CATEGORIES.map((item, index) => (
          <button
            key={item.label}
            type="button"
            role="tab"
            aria-selected={index === category}
            onClick={() => setCategory(index)}
            className={cn('h-9 shrink-0 rounded-full px-3.5 text-sm font-bold', index === category ? 'bg-ink text-on-ink' : 'bg-paper-2 text-text-soft')}
          >
            {item.label}
          </button>
        ))}
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {venues.map((venue) => (
          <li key={venue.id}>
            <button type="button" onClick={() => setSelected(venue)} className="flex w-full items-center gap-3 py-3 text-left">
              <PlaceIcon kind={venuePlaceKind(venue)} size={36} decorative />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{venue.name}</span>
                <span className="block truncate text-sm text-text-soft">
                  {DISTRICTS[venue.districtId].name} — {venue.blurb}
                </span>
              </span>
              <Navigation size={18} aria-hidden className="shrink-0 text-text-faint" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Destination({ target, onBack, homeId }: { target: Target; onBack: () => void; homeId: string | null }) {
  const destinationId = target === 'home' ? homeId : target.id;
  const name = target === 'home' ? 'Home' : target.name;
  const setDestination = useNavigation((state) => state.setDestination);
  const closePhone = useUi((state) => state.closePhone);
  const quotes = useQuery({ queryKey: queryKeys.domain('map', 'quotes', destinationId ?? ''), queryFn: () => travelApi.quotes(destinationId ?? ''), enabled: destinationId !== null, staleTime: 10_000 });
  const book = useSnapshotMutation((mode: TransportMode) => travelApi.book(destinationId ?? '', mode));

  const startGps = (): void => {
    if (!destinationId) return;
    setDestination(destinationId, name);
    gameEvents.emit('sfx', { id: 'ui-success' });
    closePhone();
  };

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="self-start text-sm font-bold text-text-soft hover:text-text">
        Back to places
      </button>
      <div className="flex items-center gap-3">
        <PlaceIcon kind={target === 'home' ? 'home' : venuePlaceKind(target)} size={52} />
        <div className="min-w-0">
          <h3 className="type-title text-2xl leading-tight">{name}</h3>
          {target !== 'home' && <p className="text-sm text-text-soft">{target.blurb}</p>}
        </div>
      </div>
      <Button icon={<Navigation size={18} aria-hidden />} onClick={startGps} block>
        Start GPS — drive or walk there
      </Button>
      <div>
        <h4 className="mb-2 font-bold">Or book a ride</h4>
        {quotes.isPending && <Spinner className="text-text-soft" />}
        {quotes.isError && <p className="text-sm text-okada">{errorMessage(quotes.error)}</p>}
        <ul className="flex flex-col gap-2">
          {quotes.data
            ?.filter((quote) => quote.mode !== 'walk' && quote.mode !== 'car')
            .map((quote) => {
              const Icon = MODE_ICON[quote.mode];
              return (
                <li key={quote.mode}>
                  <button
                    type="button"
                    disabled={!quote.available || book.isPending}
                    onClick={() =>
                      book.mutate(quote.mode, {
                        onSuccess: () => {
                          gameEvents.emit('sfx', { id: quote.mode === 'danfo' ? 'danfo-conductor' : 'car-door' });
                          toast({ title: `${quote.label} booked`, body: `On your way to ${name}.`, tone: 'neutral', amount: -quote.fare });
                          closePhone();
                        },
                        onError: (error) => toast({ title: 'Couldn’t book that ride', body: errorMessage(error), tone: 'bad' }),
                      })
                    }
                    className="flex w-full items-center gap-3 rounded-card bg-paper-2 p-3 text-left hover:bg-paper-3 disabled:opacity-50"
                  >
                    <Icon size={22} aria-hidden className="text-ink" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{quote.label}</span>
                      <span className="block text-sm text-text-soft">{quote.available ? formatGameDuration(quote.minutes) : quote.reason}</span>
                    </span>
                    {quote.available && <Money amount={quote.fare} className="font-bold" />}
                  </button>
                </li>
              );
            })}
        </ul>
      </div>
    </div>
  );
}
