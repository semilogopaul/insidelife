'use client';

import { Bus, MapPin, Plane } from 'lucide-react';
import { useState } from 'react';
import {
  FLIGHT_BOOKING_HORIZON_DAYS,
  formatGameDuration,
  formatNaira,
  getCity,
  type FlightBookingDto,
  type FlightCabin,
  type FlightDto,
  type FlightsOverviewDto,
} from '@insidelife/shared';
import { Badge, Button, ConfirmSheet, EmptyState, ErrorState, FilterChips, LoadingRows, Sheet, Tabs } from '@/common/components';
import { useUi } from '@/common/game/ui-store';
import { useGameMinute } from '@/common/game/use-game-clock';
import { useFlightAction, useFlightSearch, useFlightsOverview } from '../hooks/use-flights';
import { useRacesOverview } from '../hooks/use-races';
import { raceDeepLink } from '../services/race-format';
import { dayChipLabel } from '../services/flights-format';
import { FlightCard, TicketCard, venueName } from './parts';
import { RaceTab } from './RaceTab';

type FlightsTab = 'flights' | 'tickets' | 'coach' | 'race';

const TAB_LABELS: Readonly<Record<FlightsTab, string>> = { flights: 'Flights', tickets: 'Tickets', coach: 'Coach', race: 'Race' };

const DAY_OPTIONS = Array.from({ length: FLIGHT_BOOKING_HORIZON_DAYS }, (_, day) => ({ id: String(day), label: dayChipLabel(day) }));

/** Tickets that still matter first (open, then missed), then the rest. */
const OPEN_STATUSES = new Set(['booked', 'checked-in', 'missed']);

interface PendingBooking {
  readonly flight: FlightDto;
  readonly cabin: FlightCabin;
}

/**
 * Flights: book Lagos <-> Abuja flights (from the app anywhere, or at the airport counter), check in and board at the
 * airport, change a missed flight, take the slow coach, or race a friend to the other city (the Race tab, opened by
 * `openPhone('flights', 'race')`). The server decides every price and every rule.
 */
export function FlightsApp() {
  const overview = useFlightsOverview();
  const deepLink = useUi((state) => state.phoneParam);
  const [tab, setTab] = useState<FlightsTab | null>(null);
  const races = useRacesOverview();
  const challenges = races.data?.invitations?.length;
  const data = overview.data;

  // Opened from the airport counter: the Tickets tab when you already hold a ticket, otherwise the search.
  const defaultTab: FlightsTab = raceDeepLink(deepLink).open
    ? 'race'
    : deepLink === 'counter' && data && data.bookings.some((b) => OPEN_STATUSES.has(b.status)) ? 'tickets' : 'flights';
  const current = tab ?? defaultTab;
  const openTickets = data?.bookings.filter((booking) => OPEN_STATUSES.has(booking.status)).length;

  if (overview.isPending) return <LoadingRows label="Loading flights" />;
  if (overview.isError || !data) return <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />;

  return (
    <div className="flex flex-col gap-3">
      <Header overview={data} />
      <Tabs
        label="Flights sections"
        tour="flights-tabs"
        value={current}
        onChange={setTab}
        items={[
          { id: 'flights', label: 'Flights' },
          { id: 'tickets', label: 'Tickets', badge: openTickets || undefined },
          { id: 'coach', label: 'Coach' },
          { id: 'race', label: 'Race', badge: challenges || undefined },
        ]}
      />
      <div role="tabpanel" aria-label={TAB_LABELS[current]}>
        {current === 'flights' && <SearchTab overview={data} />}
        {current === 'tickets' && <TicketsTab overview={data} />}
        {current === 'coach' && <CoachTab overview={data} />}
        {current === 'race' && <RaceTab />}
      </div>
    </div>
  );
}

function Header({ overview }: { readonly overview: FlightsOverviewDto }) {
  const city = getCity(overview.cityId).name;
  return (
    <header className="flex items-center gap-3 rounded-card bg-noir px-4 py-3 text-on-ink">
      <MapPin size={20} aria-hidden className="text-gold" />
      <div className="min-w-0 flex-1">
        <p className="type-title text-xl">You are in {city}</p>
        <p className="truncate text-xs text-on-ink-soft">
          {overview.atAirport ? `At ${venueName(overview.airportVenueId)}: counter, check-in and gate are open to you` : `${venueName(overview.airportVenueId)} is your airport`}
        </p>
      </div>
    </header>
  );
}

/** Flights leaving the city you're in: you book from where you are (the server refuses the other city's departures). */
function SearchTab({ overview }: { readonly overview: FlightsOverviewDto }) {
  const from = overview.cityId;
  const [day, setDay] = useState(0);
  const [pending, setPending] = useState<PendingBooking | null>(null);
  const search = useFlightSearch(from, day);
  const action = useFlightAction();

  const channel = overview.atAirport ? 'counter' : 'app';
  const confirm = (): void => {
    if (!pending) return;
    action.mutate(
      { kind: 'book', flightId: pending.flight.id, cabin: pending.cabin, channel },
      { onSuccess: () => setPending(null) },
    );
  };
  const fare = pending ? (pending.cabin === 'business' ? pending.flight.businessFare : pending.flight.economyFare) : 0;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-soft">Flights from {getCity(from).name}. To fly back, book again once you land.</p>
      <FilterChips<string> label="Day" value={String(day)} onChange={(id) => setDay(Number(id))} options={DAY_OPTIONS} />
      {search.isPending ? (
        <LoadingRows rows={3} label="Searching flights" />
      ) : search.isError ? (
        <ErrorState error={search.error} onRetry={() => void search.refetch()} />
      ) : search.data.flights.length === 0 ? (
        <EmptyState icon={Plane} title="No flights this day" body="Try another day." />
      ) : (
        <ul className="flex flex-col gap-2.5" aria-label={`Flights from ${getCity(from).name}, ${dayChipLabel(day)}`}>
          {search.data.flights.map((flight) => (
            <FlightCard key={flight.id} flight={flight} busy={action.isPending} onBook={(f, cabin) => setPending({ flight: f, cabin })} />
          ))}
        </ul>
      )}
      <ConfirmSheet
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Book this flight?"
        description={
          pending
            ? `${pending.flight.airlineName} ${pending.flight.number}, ${getCity(pending.flight.fromCity).name} to ${getCity(pending.flight.toCity).name}, ${pending.cabin}`
            : undefined
        }
        confirmLabel={`Pay ${formatNaira(fare)}`}
        tone="danfo"
        loading={action.isPending}
        onConfirm={confirm}
      >
        <p className="text-sm text-text-soft">
          {channel === 'counter' ? 'You are buying at the airport counter.' : 'You are booking in the app.'} Changing a missed flight costs {formatNaira(overview.changeFee)}.
        </p>
      </ConfirmSheet>
    </div>
  );
}

function TicketsTab({ overview }: { readonly overview: FlightsOverviewDto }) {
  const now = useGameMinute(5_000);
  const action = useFlightAction();
  const [changing, setChanging] = useState<FlightBookingDto | null>(null);
  const airportName = venueName(overview.airportVenueId);

  if (overview.bookings.length === 0) {
    return <EmptyState icon={Plane} title="No tickets yet" body="Book a flight in the Flights tab, or at the airport counter." />;
  }
  return (
    <>
      <ul className="flex flex-col gap-3" aria-label="Your tickets">
        {overview.bookings.map((booking) => (
          <TicketCard
            key={booking.id}
            booking={booking}
            now={now}
            atAirport={overview.atAirport}
            airportName={airportName}
            busy={action.isPending}
            onCheckIn={(b) => action.mutate({ kind: 'check-in', bookingId: b.id })}
            onBoard={(b) => action.mutate({ kind: 'board', bookingId: b.id })}
            onChange={setChanging}
          />
        ))}
      </ul>
      <ChangeSheet booking={changing} overview={overview} onClose={() => setChanging(null)} />
    </>
  );
}

/** Alternatives leaving from the same city; the server charges the fee plus any fare increase. */
function ChangeSheet({ booking, overview, onClose }: { readonly booking: FlightBookingDto | null; readonly overview: FlightsOverviewDto; readonly onClose: () => void }) {
  const [day, setDay] = useState(0);
  const from = booking?.flight.fromCity;
  const search = useFlightSearch(from, day);
  const action = useFlightAction();
  const alternatives = (search.data?.flights ?? []).filter((flight) => flight.bookable && flight.id !== booking?.flight.id && flight.toCity === booking?.flight.toCity);

  return (
    <Sheet open={booking !== null} onClose={onClose} title="Change flight" description={booking ? `Fee ${formatNaira(booking.changeFee ?? overview.changeFee)}, plus any fare increase. No refund if the new fare is cheaper.` : undefined}>
      <div className="flex flex-col gap-3 pb-1">
        <FilterChips<string> label="Day" value={String(day)} onChange={(id) => setDay(Number(id))} options={DAY_OPTIONS.slice(0, 4)} />
        {search.isPending ? (
          <LoadingRows rows={2} label="Searching flights" />
        ) : alternatives.length === 0 ? (
          <EmptyState icon={Plane} title="Nothing else this day" body="Try another day." />
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Alternative flights">
            {alternatives.map((flight) => (
              <li key={flight.id}>
                <Button
                  variant="paper"
                  block
                  disabled={action.isPending || !booking}
                  aria-label={`Switch to ${flight.number}`}
                  onClick={() => booking && action.mutate({ kind: 'change', bookingId: booking.id, flightId: flight.id }, { onSuccess: onClose })}
                >
                  {flight.airlineName} {flight.number} · {formatNaira(booking?.cabin === 'business' ? flight.businessFare : flight.economyFare)}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

function CoachTab({ overview }: { readonly overview: FlightsOverviewDto }) {
  const action = useFlightAction();
  const { bus } = overview;
  return (
    <section className="flex flex-col gap-3 rounded-card bg-paper-2 p-4" aria-label="Interstate coach">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-full bg-cobalt-soft text-cobalt">
          <Bus size={22} aria-hidden />
        </span>
        <div>
          <p className="type-title text-xl">To {getCity(bus.toCity).name} by coach</p>
          <p className="text-sm text-text-soft">The slow, cheap way: about {formatGameDuration(bus.minutes)}.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="info">{formatNaira(bus.fare)}</Badge>
        <span className="text-sm text-text-soft">Leaves from {venueName(bus.stationVenueId)}</span>
      </div>
      <Button
        variant="danfo"
        size="lg"
        block
        disabled={!bus.available}
        loading={action.isPending}
        onClick={() => action.mutate({ kind: 'bus', toCity: bus.toCity })}
      >
        Board the coach
      </Button>
      {!bus.available && bus.reason && <p className="text-sm font-bold text-okada">{bus.reason}</p>}
    </section>
  );
}
