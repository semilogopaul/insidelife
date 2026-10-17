import {
  formatClock12,
  formatGameDuration,
  toDateParts,
  type FlightBookingDto,
  type FlightBookingStatus,
  type FlightDto,
  type FlightPhase,
  type GameMinute,
} from '@insidelife/shared';

export type ChipTone = 'neutral' | 'good' | 'bad' | 'warn' | 'info';

export const PHASE_CHIP: Readonly<Record<FlightPhase, { readonly label: string; readonly tone: ChipTone }>> = {
  scheduled: { label: 'Scheduled', tone: 'neutral' },
  'check-in': { label: 'Check-in open', tone: 'info' },
  boarding: { label: 'Boarding', tone: 'good' },
  'gate-closed': { label: 'Gate closed', tone: 'warn' },
  departed: { label: 'Departed', tone: 'bad' },
  landed: { label: 'Landed', tone: 'neutral' },
};

export const BOOKING_CHIP: Readonly<Record<FlightBookingStatus, { readonly label: string; readonly tone: ChipTone }>> = {
  booked: { label: 'Booked', tone: 'info' },
  'checked-in': { label: 'Checked in', tone: 'good' },
  boarded: { label: 'Boarded', tone: 'good' },
  flown: { label: 'Flown', tone: 'neutral' },
  missed: { label: 'You missed it', tone: 'bad' },
  changed: { label: 'Changed', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

/** "Today", "Tomorrow", "+3" for the day picker (offset from today). */
export function dayChipLabel(offset: number): string {
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  return `+${offset}`;
}

/** "7:45 AM", with "(+1d)" when the minute falls on a later day than `reference`. */
export function clockWithDay(t: GameMinute, reference: GameMinute): string {
  const dayDiff = toDateParts(t).dayIndex - toDateParts(reference).dayIndex;
  return dayDiff > 0 ? `${formatClock12(t)} (+${dayDiff}d)` : formatClock12(t);
}

export const flightDuration = (flight: Pick<FlightDto, 'departAt' | 'arriveAt'>): string =>
  formatGameDuration(flight.arriveAt - flight.departAt);

/** Live countdown line for a booking, from the game minute `now`. */
export function countdown(booking: FlightBookingDto, now: GameMinute): string | null {
  const { status, flight } = booking;
  if (status !== 'booked' && status !== 'checked-in') return null;
  if (now >= flight.departAt) return 'Departed';
  if (status === 'booked' && now < booking.checkInOpensAt) return `Check-in opens in ${formatGameDuration(booking.checkInOpensAt - now)}`;
  if (status === 'booked' && now < booking.checkInClosesAt) return `Check-in closes in ${formatGameDuration(booking.checkInClosesAt - now)}`;
  if (status === 'checked-in' && now < booking.boardingOpensAt) return `Gate opens in ${formatGameDuration(booking.boardingOpensAt - now)}`;
  if (now < booking.gateClosesAt) return `Gate closes in ${formatGameDuration(booking.gateClosesAt - now)}`;
  return `Departs in ${formatGameDuration(flight.departAt - now)}`;
}

/** Why check-in or boarding can't be done from here, or null. */
export function airportHint(booking: FlightBookingDto, atAirport: boolean, airportName: string, now: GameMinute): string | null {
  if (atAirport) return null;
  if (booking.status === 'booked' && now >= booking.checkInOpensAt && now < booking.checkInClosesAt) return `Check in at ${airportName}`;
  if (booking.status === 'checked-in' && now < booking.gateClosesAt) return `Go to ${airportName} to board`;
  return null;
}
