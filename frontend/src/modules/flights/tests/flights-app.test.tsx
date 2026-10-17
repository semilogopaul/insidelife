import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterSnapshotDto, FlightBookingDto, FlightDto, FlightsOverviewDto } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { useUi } from '@/common/game/ui-store';
import { FlightsApp } from '../components/FlightsApp';
import { airportHint, countdown, dayChipLabel } from '../services/flights-format';

const NOW = 100_000;

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/common/api/http', () => ({ api: http }));
vi.mock('@/common/game/use-game-clock', () => ({ useGameMinute: () => 100_000 }));

const flight = (id: string, overrides: Partial<FlightDto> = {}): FlightDto => ({
  id,
  airlineId: 'air-peace',
  airlineName: 'Air Peace',
  airlineCode: 'P4',
  colors: ['#0b6b3a', '#ffffff'],
  number: `P4 ${id.slice(-4)}`,
  fromCity: 'lagos',
  toCity: 'abuja',
  fromAirportVenueId: 'mmia-airport',
  toAirportVenueId: 'naia-airport',
  departAt: NOW + 300,
  arriveAt: NOW + 372,
  economyFare: 118_000,
  businessFare: 247_800,
  phase: 'scheduled',
  bookable: true,
  ...overrides,
});

const booking = (overrides: Partial<FlightBookingDto> = {}): FlightBookingDto => {
  const f = overrides.flight ?? flight('f-7001');
  return {
    id: 'b-1',
    status: 'booked',
    cabin: 'economy',
    fare: 118_000,
    channel: 'app',
    seat: '14C',
    gate: 'B3',
    bookedAt: NOW - 10,
    flight: f,
    checkInOpensAt: f.departAt - 180,
    checkInClosesAt: f.departAt - 45,
    boardingOpensAt: f.departAt - 40,
    gateClosesAt: f.departAt - 10,
    changedFrom: null,
    nextStep: 'Check in at Murtala Muhammed Airport before 2:15 PM',
    canCheckIn: false,
    canBoard: false,
    changeFee: null,
    ...overrides,
  };
};

const overviewOf = (overrides: Partial<FlightsOverviewDto> = {}): FlightsOverviewDto => ({
  cityId: 'lagos',
  otherCityId: 'abuja',
  airportVenueId: 'mmia-airport',
  atAirport: false,
  flights: [],
  bookings: [],
  bus: { toCity: 'abuja', fare: 25_000, minutes: 600, stationVenueId: 'cms-motor-park', available: true },
  changeFee: 25_000,
  now: NOW,
  ...overrides,
});

const snapshot = { asOf: NOW } as unknown as CharacterSnapshotDto;
let client: QueryClient;

function mockServer(overview: FlightsOverviewDto, flights: readonly FlightDto[] = [flight('f-7001'), flight('f-7002', { phase: 'departed', bookable: false })]): void {
  http.get.mockImplementation((path: string) =>
    Promise.resolve(path === '/flights' ? overview : { cityId: 'lagos', day: 0, flights }),
  );
  http.post.mockResolvedValue({ overview, snapshot });
}

function renderApp() {
  return render(
    <QueryClientProvider client={client}>
      <FlightsApp />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  http.get.mockReset();
  http.post.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useUi.setState({ phoneOpen: true, phoneApp: 'flights', phoneParam: null });
});

describe('flights formatting', () => {
  it('labels days and counts down to check-in and the gate', () => {
    expect([0, 1, 3].map(dayChipLabel)).toEqual(['Today', 'Tomorrow', '+3']);
    expect(countdown(booking(), NOW)).toBe('Check-in opens in 2h');
    expect(countdown(booking({ checkInOpensAt: NOW - 5 }), NOW)).toBe('Check-in closes in 4h 15m');
    expect(countdown(booking({ status: 'missed' }), NOW)).toBeNull();
    expect(airportHint(booking({ flight: flight('f-7001', { departAt: NOW + 100, arriveAt: NOW + 172 }) , checkInOpensAt: NOW - 80, checkInClosesAt: NOW + 55 }), false, 'MMIA', NOW)).toBe('Check in at MMIA');
  });
});

describe('FlightsApp', () => {
  it('lists departures with fares and a status chip, and disables Book once check-in has closed', async () => {
    mockServer(overviewOf());
    renderApp();
    expect(await screen.findByText('You are in Lagos')).toBeTruthy();
    const list = await screen.findByRole('list', { name: /Flights from Lagos, Today/ });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('Scheduled')).toBeTruthy();
    expect(within(list).getByText('Departed')).toBeTruthy();
    const open = within(list).getAllByRole('button', { name: /^Book P4 7001 economy/ })[0];
    const closed = within(list).getAllByRole('button', { name: /^Book P4 7002 economy/ })[0];
    expect((open as HTMLButtonElement).disabled).toBe(false);
    expect((closed as HTMLButtonElement).disabled).toBe(true);
  });

  it('books from the app with an idempotency key, after a confirmation', async () => {
    mockServer(overviewOf());
    renderApp();
    const list = await screen.findByRole('list', { name: /Flights from Lagos/ });
    fireEvent.click(within(list).getByRole('button', { name: /^Book P4 7001 business/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Pay/ }));
    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    const [path, body] = http.post.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('/flights/bookings');
    expect(body).toMatchObject({ flightId: 'f-7001', cabin: 'business', channel: 'app' });
    expect(typeof body.idempotencyKey).toBe('string');
    await waitFor(() => expect(client.getQueryData(queryKeys.snapshot)).toBe(snapshot));
  });

  it('uses the counter channel when you stand at the departure airport', async () => {
    mockServer(overviewOf({ atAirport: true }));
    renderApp();
    const list = await screen.findByRole('list', { name: /Flights from Lagos/ });
    fireEvent.click(within(list).getByRole('button', { name: /^Book P4 7001 economy/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Pay/ }));
    await waitFor(() => expect(http.post).toHaveBeenCalled());
    expect(http.post.mock.calls[0]?.[1]).toMatchObject({ channel: 'counter' });
  });

  it('shows tickets with the check-in button per canCheckIn and says where to check in when away', async () => {
    mockServer(overviewOf({ bookings: [booking({ id: 'b-open', canCheckIn: false, checkInOpensAt: NOW - 20, checkInClosesAt: NOW + 200 })] }));
    renderApp();
    fireEvent.click(await screen.findByRole('tab', { name: /Tickets/ }));
    const ticket = await screen.findByRole('listitem', { name: /P4 7001, Lagos to Abuja/ });
    expect(within(ticket).getByText('Seat 14C · Economy')).toBeTruthy();
    expect(within(ticket).getByText('Check in at Murtala Muhammed Airport')).toBeTruthy();
    expect((within(ticket).getByRole('button', { name: 'Check in' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('checks in and boards through the server when the flags allow it', async () => {
    mockServer(overviewOf({ atAirport: true, bookings: [booking({ id: 'b-ci', canCheckIn: true }), booking({ id: 'b-bd', status: 'checked-in', canBoard: true, flight: flight('f-7009') })] }));
    renderApp();
    fireEvent.click(await screen.findByRole('tab', { name: /Tickets/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Check in' }));
    await waitFor(() => expect(http.post).toHaveBeenCalledWith('/flights/bookings/b-ci/check-in'));
    fireEvent.click(await screen.findByRole('button', { name: 'Board' }));
    await waitFor(() => expect(http.post).toHaveBeenCalledWith('/flights/bookings/b-bd/board'));
  });

  it('shows the missed state and a change flow that posts the new flight with a key', async () => {
    const missed = booking({ id: 'b-miss', status: 'missed', changeFee: 25_000, nextStep: 'Change to another flight' });
    mockServer(overviewOf({ bookings: [missed] }), [flight('f-8001'), flight('f-7001')]);
    renderApp();
    fireEvent.click(await screen.findByRole('tab', { name: /Tickets/ }));
    expect(await screen.findByText('You missed it. The plane has left without you.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Change flight/ }));
    const alternatives = await screen.findByRole('list', { name: 'Alternative flights' });
    // The missed flight itself is not offered.
    expect(within(alternatives).queryByRole('button', { name: 'Switch to P4 7001' })).toBeNull();
    fireEvent.click(within(alternatives).getByRole('button', { name: 'Switch to P4 8001' }));
    await waitFor(() => expect(http.post).toHaveBeenCalled());
    const [path, body] = http.post.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('/flights/bookings/b-miss/change');
    expect(body).toMatchObject({ flightId: 'f-8001' });
    expect(typeof body.idempotencyKey).toBe('string');
  });

  it('opens on the Tickets tab from the airport counter when you hold a booking', async () => {
    useUi.setState({ phoneParam: 'counter' });
    mockServer(overviewOf({ bookings: [booking()] }));
    renderApp();
    const tab = await screen.findByRole('tab', { name: /Tickets/ });
    expect(tab.getAttribute('aria-selected')).toBe('true');
  });

  it('coach: fare, station and a working button; disabled with the server’s reason when unavailable', async () => {
    mockServer(overviewOf());
    const view = renderApp();
    fireEvent.click(await screen.findByRole('tab', { name: 'Coach' }));
    expect(await screen.findByText(/Leaves from/)).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Board the coach' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(http.post).toHaveBeenCalled());
    expect(http.post.mock.calls[0]?.[0]).toBe('/travel/bus');
    expect(http.post.mock.calls[0]?.[1]).toMatchObject({ toCity: 'abuja' });
    view.unmount();

    mockServer(overviewOf({ bus: { toCity: 'abuja', fare: 25_000, minutes: 600, stationVenueId: 'cms-motor-park', available: false, reason: 'Be at Lagos Island Motor Park' } }));
    client.clear();
    renderApp();
    fireEvent.click(await screen.findByRole('tab', { name: 'Coach' }));
    expect((screen.getByRole('button', { name: 'Board the coach' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Be at Lagos Island Motor Park')).toBeTruthy();
  });
});
