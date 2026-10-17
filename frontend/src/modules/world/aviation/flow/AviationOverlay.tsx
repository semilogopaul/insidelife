'use client';

import { Plane, PlaneLanding, PlaneTakeoff, Ticket } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { CITIES, GAT_NAMES, cityOfVenueId, findVenue, formatClock12, formatGameDuration, formatNaira, type CharacterSnapshotDto, type FlightBookingDto, type OwnedAircraftDto } from '@insidelife/shared';
import { useAboard, useFlightsState, useFlyAircraft, useGateAction } from '@/common/aviation';
import { useSnapshot } from '@/common/game/snapshot';
import { useUi } from '@/common/game/ui-store';
import { useGameMinute } from '@/common/game/use-game-clock';
import { cn } from '@/common/utils/cn';
import { useHomeView } from '../../interiors/walk/home-view-store';
import { FlightOverlay } from '../flight/FlightOverlay';
import { AVIATION_TERMINAL_ID } from '../terminal/terminal-templates';
import { gatCity, takeoffCheck } from './flight-plan';
import type { AviationScene } from './use-aviation-scene';

const cityNameOf = (venueId: string): string => {
  const city = cityOfVenueId(venueId);
  return city ? CITIES[city].name : 'the airport';
};

/** The DOM half of flying: the sky sequence's captions and Skip, the cabin's take-off panel, the apron's stand picker and the gate. */
export function AviationOverlay({ scene }: { readonly scene: AviationScene }) {
  const { data: snapshot } = useSnapshot();
  useReturnToApron(scene);
  if (!snapshot) return null;
  switch (scene.kind) {
    case 'sky':
      return <SkyOverlay scene={scene} snapshot={snapshot} />;
    case 'cabin':
      return scene.arriveAt !== null ? <InFlightPanel scene={scene} snapshot={snapshot} /> : scene.plane ? <ParkedCabinPanel plane={scene.plane} /> : null;
    case 'terminal':
      return <ApronPanel scene={scene} />;
    case 'none':
      return findVenue(snapshot.character.locationId)?.type === 'airport' && !snapshot.travel ? <GateCard /> : null;
  }
}

/** After stepping out of the plane the terminal opens on the apron, not in the lounge. */
function useReturnToApron(scene: AviationScene): void {
  const returning = useAboard((state) => state.returnToAirside);
  const house = useHomeView((state) => state.house);
  const roomId = useHomeView((state) => state.roomId);
  const fading = useHomeView((state) => state.fading);
  const inTerminal = scene.kind === 'terminal' && house !== null && house.endsWith(`|${AVIATION_TERMINAL_ID}`);
  useEffect(() => {
    if (!returning || !inTerminal || fading) return;
    if (roomId === 'airside') {
      useAboard.getState().arrivedAirside();
      return;
    }
    useHomeView.getState().travel('airside');
  }, [returning, inTerminal, roomId, fading]);
}

function Card({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[72px] z-10 flex justify-center px-4">
      <div className={cn('pointer-events-auto w-full max-w-sm rounded-card bg-ink/85 p-3 text-on-ink shadow-lg backdrop-blur-sm', className)}>{children}</div>
    </div>
  );
}

function SkyOverlay({ scene, snapshot }: { readonly scene: Extract<AviationScene, { kind: 'sky' }>; readonly snapshot: CharacterSnapshotDto }) {
  const travel = snapshot.travel;
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <FlightOverlay
        cls={scene.flight.cls}
        durationMs={scene.durationMs}
        from={travel ? cityNameOf(travel.fromLocationId) : undefined}
        to={travel ? cityNameOf(travel.toLocationId) : undefined}
        onSkip={() => useAboard.getState().skipFlight(scene.key)}
      />
    </div>
  );
}

// ----- Parked in your plane ----------------------------------------------------------------------------------------

function ParkedCabinPanel({ plane }: { readonly plane: OwnedAircraftDto }) {
  const fly = useFlyAircraft();
  const roomId = useHomeView((state) => state.roomId);
  const title = plane.callName ? `${plane.callName} · ${plane.registration}` : plane.registration;
  return (
    <Card>
      <div className="flex items-center gap-2">
        <Plane size={18} aria-hidden />
        <div className="min-w-0">
          <p className="type-title truncate text-base leading-tight">{title}</p>
          <p className="truncate text-xs text-on-ink-soft">{plane.name} · {GAT_NAMES[plane.parkedAt]}</p>
        </div>
        <button type="button" onClick={() => useAboard.getState().deplane()} className="ml-auto h-9 shrink-0 rounded-card border border-white/30 px-3 text-sm font-semibold">
          Step out
        </button>
      </div>
      <ul className="mt-2 space-y-2">
        {plane.flights.map((option) => {
          const check = takeoffCheck(plane, option, roomId);
          const city = gatCity(option.destination);
          return (
            <li key={option.destination}>
              <button
                type="button"
                disabled={!check.allowed || fly.isPending}
                onClick={() => fly.mutate({ aircraftId: plane.id, destination: option.destination })}
                className="flex min-h-12 w-full items-center gap-2 rounded-card bg-danfo px-3 text-left font-bold text-ink disabled:bg-white/15 disabled:text-on-ink-soft"
              >
                <PlaneTakeoff size={18} aria-hidden />
                <span className="flex-1">Fly to {city}</span>
                <span className="text-xs font-semibold">
                  {formatGameDuration(option.minutes)} · fuel {formatNaira(option.fuelCost)}
                </span>
              </button>
              {check.reason && <p className="mt-1 text-xs text-on-ink-soft">{check.reason}</p>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ----- In the air ------------------------------------------------------------------------------------------------

function InFlightPanel({ scene, snapshot }: { readonly scene: Extract<AviationScene, { kind: 'cabin' }>; readonly snapshot: CharacterSnapshotDto }) {
  const now = useGameMinute(1000);
  const travel = snapshot.travel;
  const left = Math.max(0, (scene.arriveAt ?? now) - now);
  const label = scene.flight?.kind === 'commercial' ? `${scene.flight.booking.flight.number} to ${travel ? cityNameOf(travel.toLocationId) : 'your destination'}` : scene.plane ? `${scene.plane.registration} to ${travel ? cityNameOf(travel.toLocationId) : 'your destination'}` : 'In flight';
  const skipped = useAboard((state) => state.skippedFlight);
  return (
    <Card>
      <div className="flex items-center gap-2">
        <PlaneLanding size={18} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="type-title truncate text-base leading-tight">{label}</p>
          <p className="text-xs text-on-ink-soft">Landing in {formatGameDuration(Math.max(1, Math.round(left)))}. Walk about the cabin.</p>
        </div>
        {skipped !== null && (
          <button type="button" onClick={() => useAboard.getState().watchFlight()} className="h-9 shrink-0 rounded-card border border-white/30 px-3 text-sm font-semibold">
            Watch
          </button>
        )}
      </div>
    </Card>
  );
}

// ----- The apron ------------------------------------------------------------------------------------------------

function ApronPanel({ scene }: { readonly scene: Extract<AviationScene, { kind: 'terminal' }> }) {
  const roomId = useHomeView((state) => state.roomId);
  const house = useHomeView((state) => state.house);
  const chosen = scene.onStand?.id ?? null;
  if (!house?.endsWith(`|${AVIATION_TERMINAL_ID}`) || roomId !== 'airside') return null;
  if (scene.parked.length === 0 && scene.hangared === 0) return null;
  return (
    <Card className="max-w-xs p-2.5 text-sm">
      {scene.onStand ? <p className="font-semibold">Walk up to {scene.onStand.registration} to board it.</p> : <p className="font-semibold">You have no aircraft parked here.</p>}
      {scene.parked.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Which aircraft stands on your stand">
          {scene.parked.map((plane) => (
            <button
              key={plane.id}
              type="button"
              aria-pressed={plane.id === chosen}
              onClick={() => useAboard.getState().choose(plane.id)}
              className={cn('h-8 rounded-card px-2.5 text-xs font-bold', plane.id === chosen ? 'bg-danfo text-ink' : 'border border-white/30')}
            >
              {plane.registration}
            </button>
          ))}
        </div>
      )}
      {scene.hangared > 0 && <p className="mt-1 text-xs text-on-ink-soft">{scene.hangared === 1 ? '1 other plane is' : `${scene.hangared} other planes are`} in the hangars.</p>}
    </Card>
  );
}

// ----- The gate (commercial flights) -------------------------------------------------------------------------------

/** The next flight you hold a seat on, from the airport you're in: check in, and board at the gate when it opens. */
function GateCard() {
  const flights = useFlightsState(true);
  const act = useGateAction();
  const now = useGameMinute(5000);
  const data = flights.data;
  if (!data?.atAirport) return null;
  const booking = nextBooking(data.bookings, data.airportVenueId);
  if (!booking) return null;
  const { flight } = booking;
  const to = CITIES[flight.toCity].name;
  const missed = booking.status === 'missed';
  return (
    <Card>
      <div className="flex items-center gap-2">
        <Ticket size={18} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="type-title truncate text-base leading-tight">
            {flight.airlineName} {flight.number} to {to}
          </p>
          <p className="text-xs text-on-ink-soft">{missed ? `You missed it. Change it for ${formatNaira(booking.changeFee ?? 0)}.` : `Gate ${booking.gate}, seat ${booking.seat}. ${gateLine(booking, now)}`}</p>
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        {booking.canCheckIn && (
          <button type="button" disabled={act.isPending} onClick={() => act.mutate({ kind: 'check-in', bookingId: booking.id })} className="min-h-11 flex-1 rounded-card bg-danfo px-3 font-bold text-ink disabled:opacity-60">
            Check in
          </button>
        )}
        {booking.canBoard && (
          <button type="button" disabled={act.isPending} onClick={() => act.mutate({ kind: 'board', bookingId: booking.id })} className="min-h-11 flex-1 rounded-card bg-danfo px-3 font-bold text-ink disabled:opacity-60">
            Board at gate {booking.gate}
          </button>
        )}
        {(missed || !booking.canBoard) && (
          <button type="button" onClick={() => useUi.getState().openPhone('flights')} className="min-h-11 flex-1 rounded-card border border-white/30 px-3 text-sm font-semibold">
            {missed ? 'Change flight' : 'Boarding pass'}
          </button>
        )}
      </div>
    </Card>
  );
}

/** The booking to show at the gate: one you can act on, else the soonest live one, else a missed one to change. */
export function nextBooking(bookings: readonly FlightBookingDto[], airportVenueId: string): FlightBookingDto | null {
  const here = bookings.filter((booking) => booking.flight.fromAirportVenueId === airportVenueId);
  const live = here.filter((booking) => booking.status === 'booked' || booking.status === 'checked-in').toSorted((a, b) => a.flight.departAt - b.flight.departAt);
  return live.find((booking) => booking.canBoard || booking.canCheckIn) ?? live[0] ?? here.find((booking) => booking.status === 'missed') ?? null;
}

function gateLine(booking: FlightBookingDto, now: number): string {
  if (booking.canBoard) return `Boarding now. The gate closes at ${formatClock12(booking.gateClosesAt)}.`;
  if (booking.status === 'booked') return now < booking.checkInOpensAt ? `Check-in opens at ${formatClock12(booking.checkInOpensAt)}.` : `Check in before ${formatClock12(booking.checkInClosesAt)}.`;
  return `Gate opens at ${formatClock12(booking.boardingOpensAt)}.`;
}
