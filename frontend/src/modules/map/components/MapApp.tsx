'use client';

import { Bike, Bus, Car, CarTaxiFront, Footprints, Navigation } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  CITIES,
  DISTRICTS,
  GAT_NAMES,
  OTHER_CITY_REASON,
  VENUES,
  cityOfDistrict,
  cityOfVenue,
  formatGameDuration,
  homeLocationId,
  type OwnedPropertyMarkerDto,
  type TransportMode,
  type VenueType,
} from '@insidelife/shared';
import { ApiError, errorMessage } from '@/common/api/api-error';
import { PlaceIcon, propertyPlaceKind, venuePlaceKind } from '@/common/brand/place-icons';
import { Button, Money, Spinner, toast } from '@/common/components';
import { useOwnFleet } from '@/common/aviation';
import { gameEvents } from '@/common/game/game-events';
import { useNavigation } from '@/common/game/navigation-store';
import { useSnapshot, useSnapshotMutation } from '@/common/game/snapshot';
import { useUi } from '@/common/game/ui-store';
import { formatHour } from '@/common/places';
import { carAvailability, useTravelQuotes, type TravelQuote } from '@/common/travel/travel-quotes';
import { cn } from '@/common/utils/cn';
import { useVisits } from '@/common/visits';
import { travelApi } from '../services/travel.api';
import { expectedVisits, targetFromParam, targetLocationId, targetName, type MapTarget } from '../services/targets';

const CATEGORIES: ReadonlyArray<{ readonly label: string; readonly types: readonly VenueType[] }> = [
  // The landmarks first: they're what the "now live" announcement points players to.
  { label: 'Must see', types: ['mansion', 'private-jet', 'refinery'] },
  { label: 'Food', types: ['buka', 'restaurant'] },
  { label: 'School', types: ['campus', 'cbt-centre', 'school'] },
  { label: 'Work', types: ['office', 'government'] },
  { label: 'Health', types: ['hospital-public', 'hospital-private', 'pharmacy'] },
  { label: 'Shopping', types: ['market', 'mall', 'car-dealer', 'salon'] },
  { label: 'Fun', types: ['bar', 'club', 'beach', 'park', 'cinema', 'event-centre', 'gym'] },
  { label: 'Services', types: ['estate-agency', 'airport', 'aviation-terminal', 'motor-park', 'church', 'mosque'] },
];

const STAGE_LABEL: Readonly<Record<OwnedPropertyMarkerDto['stage'], string>> = {
  land: 'Your land',
  construction: 'Building site',
  built: 'Your house',
};

const MODE_ICON: Record<TransportMode, typeof Bus> = { walk: Footprints, okada: Bike, keke: CarTaxiFront, danfo: Bus, brt: Bus, bolt: CarTaxiFront, car: Car, taxi: CarTaxiFront, bus: Bus };

/** Pick a destination: walk or drive there with the GPS, or book a ride. */
export function MapApp() {
  const phoneParam = useUi((state) => state.phoneParam);
  const [category, setCategory] = useState(0);
  // What's open: a venue id, `home`, or `home:<id>` (resolved on render, so a host's name shows once visits load).
  const [selected, setSelected] = useState<string | null>(phoneParam);
  // A new deep link while the Map is already open jumps to that place (adjusting state during render, not an effect).
  const [linkedParam, setLinkedParam] = useState(phoneParam);
  if (phoneParam !== linkedParam) {
    setLinkedParam(phoneParam);
    setSelected(phoneParam);
  }
  const { data: snapshot } = useSnapshot();
  const visits = useVisits(snapshot !== undefined);
  const cityId = snapshot?.character.cityId ?? 'lagos';
  const openPhone = useUi((state) => state.openPhone);
  const venues = useMemo(() => VENUES.filter((venue) => cityOfVenue(venue) === cityId && CATEGORIES[category]!.types.includes(venue.type)), [category, cityId]);
  const setDestination = useNavigation((state) => state.setDestination);
  const closePhone = useUi((state) => state.closePhone);
  // Land and houses you own but don't live in (where you live is Home): GPS only, rides go to venues and home.
  const properties = (snapshot?.summary.properties ?? []).filter((property) => !property.livedIn);
  const homeCity = snapshot ? cityOfDistrict(snapshot.character.homeDistrictId) : cityId;
  const homeId = snapshot ? homeLocationId(snapshot.character.id) : null;
  // Someone is expecting you: their place is a destination like any other while the invite stands.
  const expected = expectedVisits(visits.data?.incoming, snapshot?.character.locationId ?? null);
  const target = targetFromParam(selected, homeId, visits.data?.incoming);
  const targetId = target ? targetLocationId(target, homeId) : null;

  if (target && targetId) return <Destination target={target} destinationId={targetId} onBack={() => setSelected(null)} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 rounded-card bg-ink px-3.5 py-2.5 text-on-ink" data-testid="map-city">
        <span className="min-w-0">
          <span className="block text-xs font-bold uppercase tracking-wide opacity-70">You’re in</span>
          <span className="block truncate font-bold">{CITIES[cityId].name}</span>
        </span>
        <button type="button" onClick={() => openPhone('flights')} className="shrink-0 rounded-full bg-danfo px-3 py-1.5 text-sm font-bold text-ink hover:brightness-95">
          Fly or take the bus
        </button>
      </div>
      <button type="button" onClick={() => setSelected('home')} className="flex items-center gap-3 rounded-card bg-paper-2 p-3 text-left hover:bg-paper-3">
        <PlaceIcon kind="home" size={40} decorative />
        <span>
          <span className="block font-bold">Home</span>
          <span className="text-sm text-text-soft">
            {snapshot ? DISTRICTS[snapshot.character.homeDistrictId].name : ''}
            {homeCity !== cityId ? ` · ${CITIES[homeCity].name}` : ''}
          </span>
        </span>
      </button>
      {expected.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Expected at">
          {expected.map((visit) =>
            visit.kind === 'visit' ? (
              <li key={visit.locationId}>
                <button
                  type="button"
                  onClick={() => setSelected(visit.locationId)}
                  className="flex w-full items-center gap-3 rounded-card bg-danfo-soft p-3 text-left ring-1 ring-danfo hover:bg-paper-3"
                >
                  <PlaceIcon kind="home" size={40} decorative />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{visit.name}</span>
                    <span className="block truncate text-sm text-text-soft">
                      Expecting you{visit.districtId ? ` · ${DISTRICTS[visit.districtId].name}` : ''}
                    </span>
                  </span>
                  <Navigation size={18} aria-hidden className="shrink-0 text-text-faint" />
                </button>
              </li>
            ) : null,
          )}
        </ul>
      )}
      {properties.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Your properties">
          {properties.map((property) => (
            <li key={property.id}>
              <button
                type="button"
                onClick={() => {
                  if (cityOfDistrict(property.districtId) !== cityId) {
                    toast({ title: `That’s in ${CITIES[cityOfDistrict(property.districtId)].name}`, body: OTHER_CITY_REASON, tone: 'neutral' });
                    return;
                  }
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
                  {cityOfDistrict(property.districtId) !== cityId ? (
                    CITIES[cityOfDistrict(property.districtId)].name
                  ) : (
                    <>
                      <Navigation size={16} aria-hidden /> GPS
                    </>
                  )}
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
        {venues.map((venue, row) => (
          <li key={venue.id} data-tour={row === 0 ? 'map-place' : undefined}>
            <button type="button" onClick={() => setSelected(venue.id)} className="flex w-full items-center gap-3 py-3 text-left">
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

/** "Berger Car Mart will be closed when you get there (opens 8 AM)". */
/** "Or fly your own": where each of your planes is parked, and the Hangar to fly it from. Renders nothing without a plane. */
function OwnPlanes() {
  const openPhone = useUi((state) => state.openPhone);
  const fleet = useOwnFleet();
  const mine = fleet.data?.mine ?? [];
  if (mine.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 border-t border-danfo/60 pt-2.5" data-testid="map-own-planes">
      <p className="text-sm font-bold">Or fly your own</p>
      <ul className="flex flex-col gap-1 text-sm text-text-soft">
        {mine.map((plane) => (
          <li key={plane.id}>
            <span className="font-semibold text-text">{plane.registration}</span> · {plane.name} · {plane.airborne ? 'in the air' : `at the ${GAT_NAMES[plane.parkedAt]}`}
          </li>
        ))}
      </ul>
      <Button variant="paper" onClick={() => openPhone('hangar', 'fleet')}>
        Open Hangar
      </Button>
    </div>
  );
}

const closedCopy = (name: string, opens: number): string => `${name} will be closed when you get there (opens ${formatHour(opens)})`;

function Destination({ target, destinationId, onBack }: { readonly target: MapTarget; readonly destinationId: string; readonly onBack: () => void }) {
  const name = targetName(target);
  const setDestination = useNavigation((state) => state.setDestination);
  const closePhone = useUi((state) => state.closePhone);
  const quotes = useTravelQuotes(destinationId);
  const book = useSnapshotMutation(({ mode, acceptClosed }: { readonly mode: TransportMode; readonly acceptClosed: boolean }) => travelApi.book(destinationId, mode, acceptClosed));
  // A ride that lands after closing time asks first ("Book anyway").
  const [confirming, setConfirming] = useState<{ readonly mode: TransportMode; readonly message: string } | null>(null);
  const car = quotes.data?.find((quote) => quote.mode === 'car');
  const walk = quotes.data?.find((quote) => quote.mode === 'walk' && quote.available);
  const { hasCar, why: noCarWhy } = carAvailability(car);
  const detail = target.kind === 'venue' ? target.venue.blurb : target.kind === 'visit' ? target.detail : null;
  const openPhone = useUi((state) => state.openPhone);
  // Across the water: no road, no ride, no GPS. The server says so for every mode.
  const otherCity = quotes.data !== undefined && quotes.data.length > 0 && quotes.data.every((quote) => !quote.available && quote.reason === OTHER_CITY_REASON);

  const guide = (how: 'walk' | 'drive'): void => {
    setDestination(destinationId, name);
    gameEvents.emit('sfx', { id: 'ui-success' });
    toast({
      title: `GPS set: ${name}`,
      body: how === 'drive' ? 'Get in your car and follow the route on your minimap.' : 'Follow the route on your minimap.',
      tone: 'neutral',
    });
    closePhone();
  };

  const ride = (quote: TravelQuote, acceptClosed: boolean): void =>
    book.mutate(
      { mode: quote.mode, acceptClosed },
      {
        onSuccess: () => {
          setConfirming(null);
          gameEvents.emit('sfx', { id: quote.mode === 'danfo' ? 'danfo-conductor' : 'car-door' });
          toast({ title: `${quote.label} booked`, body: `On your way to ${name}.`, tone: 'neutral', amount: -quote.fare });
          closePhone();
        },
        onError: (error) => {
          // The clock moved on since the quote: the server is the judge, so ask now.
          if (error instanceof ApiError && error.code === 'CLOSED_ON_ARRIVAL') {
            setConfirming({ mode: quote.mode, message: errorMessage(error) });
            void quotes.refetch();
            return;
          }
          toast({ title: 'Couldn’t book that ride', body: errorMessage(error), tone: 'bad' });
        },
      },
    );

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="self-start text-sm font-bold text-text-soft hover:text-text">
        Back to places
      </button>
      <div className="flex items-center gap-3">
        <PlaceIcon kind={target.kind === 'venue' ? venuePlaceKind(target.venue) : 'home'} size={52} />
        <div className="min-w-0">
          <h3 className="type-title text-2xl leading-tight">{name}</h3>
          {detail && <p className="text-sm text-text-soft">{detail}</p>}
        </div>
      </div>
      {otherCity && (
        <div role="note" className="flex flex-col gap-2 rounded-card bg-danfo-soft p-3.5 ring-1 ring-danfo" data-testid="map-other-city">
          <p className="font-bold">{name} is in another city.</p>
          <p className="text-sm text-text-soft">{OTHER_CITY_REASON} There are no roads between Lagos and Abuja, so the map and GPS stop at the city limits.</p>
          <Button variant="ink" onClick={() => openPhone('flights')}>
            Book a flight
          </Button>
          <OwnPlanes />
        </div>
      )}
      <div className={cn('grid gap-2', otherCity && 'hidden')} role="group" aria-label={`Go to ${name} yourself`} data-tour="map-gps">
        <Button icon={<Footprints size={18} aria-hidden />} onClick={() => guide('walk')} block className="justify-start">
          Walk there with GPS{walk ? ` · ${formatGameDuration(walk.minutes)}` : ''}
        </Button>
        <Button
          variant="paper"
          icon={<Car size={18} aria-hidden />}
          onClick={() => guide('drive')}
          disabled={!hasCar}
          block
          className="justify-start"
          aria-describedby={hasCar ? undefined : 'map-no-car'}
        >
          Drive my car with GPS{hasCar && car?.available ? ` · ${formatGameDuration(car.minutes)}` : ''}
        </Button>
        {!hasCar && !quotes.isPending && (
          <p id="map-no-car" className="-mt-1 px-1 text-xs text-text-soft">
            {noCarWhy}
          </p>
        )}
      </div>
      <div data-tour="map-rides" className={cn(otherCity && 'hidden')}>
        <h4 className="mb-2 font-bold">Or book a ride</h4>
        {quotes.isPending && <Spinner className="text-text-soft" />}
        {quotes.isError && <p className="text-sm text-okada">{errorMessage(quotes.error)}</p>}
        <ul className="flex flex-col gap-2">
          {quotes.data
            ?.filter((quote) => quote.mode !== 'walk' && quote.mode !== 'car')
            .map((quote) => {
              const Icon = MODE_ICON[quote.mode];
              const closed = quote.available ? quote.closedOnArrival : undefined;
              const asking = confirming?.mode === quote.mode ? confirming : null;
              return (
                <li key={quote.mode}>
                  <button
                    type="button"
                    disabled={!quote.available || book.isPending}
                    aria-expanded={closed !== undefined ? asking !== null : undefined}
                    onClick={() =>
                      closed !== undefined ? setConfirming({ mode: quote.mode, message: closedCopy(name, closed) }) : ride(quote, false)
                    }
                    className="flex w-full items-center gap-3 rounded-card bg-paper-2 p-3 text-left hover:bg-paper-3 disabled:opacity-50"
                  >
                    <Icon size={22} aria-hidden className="text-ink" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{quote.label}</span>
                      <span className="block text-sm text-text-soft">{quote.available ? formatGameDuration(quote.minutes) : quote.reason}</span>
                      {closed !== undefined && (
                        <span className="block text-sm font-bold text-okada">Closed when you arrive (opens {formatHour(closed)})</span>
                      )}
                    </span>
                    {quote.available && <Money amount={quote.fare} className="font-bold" />}
                  </button>
                  {asking && (
                    <div role="alert" className="mt-1.5 rounded-card bg-okada-soft p-3 text-sm text-ink">
                      <p>
                        <span className="font-bold">{asking.message}.</span> The fare isn’t refunded at a locked gate.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Button size="sm" variant="ink" loading={book.isPending} onClick={() => ride(quote, true)}>
                          Book anyway · <Money amount={quote.fare} compact />
                        </Button>
                        <Button size="sm" variant="paper" onClick={() => setConfirming(null)}>
                          Not now
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
        </ul>
      </div>
    </div>
  );
}
