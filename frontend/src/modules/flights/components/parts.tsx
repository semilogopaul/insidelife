'use client';

import { Armchair, DoorOpen, Plane } from 'lucide-react';
import { findVenue, formatNaira, getCity, type FlightBookingDto, type FlightCabin, type FlightDto, type GameMinute } from '@insidelife/shared';
import { Badge, Button } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { BOOKING_CHIP, PHASE_CHIP, airportHint, clockWithDay, countdown, flightDuration } from '../services/flights-format';

export const venueName = (venueId: string): string => findVenue(venueId)?.name ?? 'the airport';

/** The airline's colour as a small chip with its two-letter code. */
export function AirlineChip({ flight }: { readonly flight: FlightDto }) {
  const [primary, accent] = flight.colors;
  return (
    <span
      className="inline-flex h-8 min-w-10 items-center justify-center rounded-chip px-2 text-xs font-extrabold tracking-wide"
      style={{ backgroundColor: primary, color: accent }}
      title={flight.airlineName}
    >
      {flight.airlineCode}
    </span>
  );
}

/** "Lagos 7:45 AM -> Abuja 9:00 AM · 1h 12m". */
function Times({ flight }: { readonly flight: FlightDto }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <div>
        <p className="tabular text-lg font-bold">{clockWithDay(flight.departAt, flight.departAt)}</p>
        <p className="text-xs text-text-soft">{getCity(flight.fromCity).name}</p>
      </div>
      <div className="flex flex-1 flex-col items-center text-text-faint" aria-hidden>
        <Plane size={16} className="rotate-0" />
        <span className="h-px w-full bg-line" />
      </div>
      <div className="text-right">
        <p className="tabular text-lg font-bold">{clockWithDay(flight.arriveAt, flight.departAt)}</p>
        <p className="text-xs text-text-soft">{getCity(flight.toCity).name}</p>
      </div>
    </div>
  );
}

export interface FlightCardProps {
  readonly flight: FlightDto;
  readonly busy: boolean;
  readonly onBook: (flight: FlightDto, cabin: FlightCabin) => void;
}

/** One departure in the search list, with its two fares as buttons. */
export function FlightCard({ flight, busy, onBook }: FlightCardProps) {
  const chip = PHASE_CHIP[flight.phase];
  return (
    <li className="flex flex-col gap-3 rounded-card bg-paper-2 p-3">
      <div className="flex items-center gap-2">
        <AirlineChip flight={flight} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{flight.airlineName}</p>
          <p className="tabular text-xs text-text-soft">
            {flight.number} · {flightDuration(flight)}
          </p>
        </div>
        <Badge tone={chip.tone}>{chip.label}</Badge>
      </div>
      <Times flight={flight} />
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="paper"
          size="sm"
          disabled={!flight.bookable || busy}
          aria-label={`Book ${flight.number} economy for ${formatNaira(flight.economyFare)}`}
          onClick={() => onBook(flight, 'economy')}
        >
          Economy {formatNaira(flight.economyFare)}
        </Button>
        <Button
          variant="danfo"
          size="sm"
          disabled={!flight.bookable || busy}
          aria-label={`Book ${flight.number} business for ${formatNaira(flight.businessFare)}`}
          onClick={() => onBook(flight, 'business')}
        >
          Business {formatNaira(flight.businessFare)}
        </Button>
      </div>
      {!flight.bookable && <p className="text-xs text-text-soft">Check-in has closed for this flight.</p>}
    </li>
  );
}

export interface TicketCardProps {
  readonly booking: FlightBookingDto;
  readonly now: GameMinute;
  readonly atAirport: boolean;
  readonly airportName: string;
  readonly busy: boolean;
  readonly onCheckIn: (booking: FlightBookingDto) => void;
  readonly onBoard: (booking: FlightBookingDto) => void;
  readonly onChange: (booking: FlightBookingDto) => void;
}

/** A boarding pass: route, seat and gate, where it stands, and the one thing to do next. */
export function TicketCard({ booking, now, atAirport, airportName, busy, onCheckIn, onBoard, onChange }: TicketCardProps) {
  const { flight } = booking;
  const chip = BOOKING_CHIP[booking.status];
  const missed = booking.status === 'missed';
  const timer = countdown(booking, now);
  const hint = airportHint(booking, atAirport, airportName, now);
  const active = booking.status === 'booked' || booking.status === 'checked-in';
  return (
    <li
      aria-label={`${flight.number}, ${getCity(flight.fromCity).name} to ${getCity(flight.toCity).name}`}
      className={cn('overflow-hidden rounded-card ring-1', missed ? 'bg-okada-soft ring-okada/40' : 'bg-paper-2 ring-line', !active && !missed && 'opacity-80')}
    >
      <div className="flex items-center gap-2 px-3 py-2" style={{ backgroundColor: flight.colors[0], color: flight.colors[1] }}>
        <Plane size={16} aria-hidden />
        <span className="flex-1 truncate text-sm font-extrabold">{flight.airlineName}</span>
        <span className="tabular text-sm font-bold">{flight.number}</span>
      </div>
      <div className="flex flex-col gap-3 p-3">
        <Times flight={flight} />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone={chip.tone}>{chip.label}</Badge>
          <span className="inline-flex items-center gap-1 text-text-soft">
            <Armchair size={14} aria-hidden /> Seat {booking.seat} · {booking.cabin === 'business' ? 'Business' : 'Economy'}
          </span>
          <span className="inline-flex items-center gap-1 text-text-soft">
            <DoorOpen size={14} aria-hidden /> Gate {booking.gate}
          </span>
        </div>
        {missed ? (
          <p className="text-sm font-bold text-okada" role="status">
            You missed it. The plane has left without you.
          </p>
        ) : (
          timer && (
            <p className="tabular text-sm font-bold" aria-live="polite">
              {timer}
            </p>
          )
        )}
        <p className="text-sm text-text-soft">{booking.nextStep}</p>
        {hint && <p className="rounded-chip bg-danfo-soft px-2 py-1 text-xs font-bold text-[#7a5600]">{hint}</p>}
        {(active || booking.changeFee !== null) && (
          <div className="flex flex-col gap-2">
            {booking.status === 'booked' && (
              <Button variant="danfo" disabled={!booking.canCheckIn || busy} onClick={() => onCheckIn(booking)}>
                Check in
              </Button>
            )}
            {booking.status === 'checked-in' && (
              <Button variant="danfo" disabled={!booking.canBoard || busy} onClick={() => onBoard(booking)}>
                Board
              </Button>
            )}
            {booking.changeFee !== null && (
              <Button variant={missed ? 'danfo' : 'paper'} disabled={busy} onClick={() => onChange(booking)}>
                Change flight · {formatNaira(booking.changeFee)} fee
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
