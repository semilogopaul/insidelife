import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RaceDto, RaceRacerDto, RacesOverviewDto } from '@insidelife/shared';
import { useUi } from '@/common/game/ui-store';
import { RaceTab } from '../components/RaceTab';
import { raceChip, raceClock, raceDeepLink, racerLine } from '../services/race-format';

const NOW = 100_000;

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/common/api/http', () => ({ api: http }));
vi.mock('@/common/game/use-game-clock', () => ({ useGameMinute: () => 100_000 }));
vi.mock('@/common/realtime/use-realtime', () => ({ useRealtimeEvent: () => undefined }));

const racer = (overrides: Partial<RaceRacerDto> = {}): RaceRacerDto => ({
  characterId: 'c-1',
  handle: 'ada',
  name: 'Ada Okafor',
  isYou: false,
  isChallenger: false,
  status: 'accepted',
  finishedAt: null,
  elapsedMinutes: null,
  how: null,
  howLabel: null,
  place: null,
  winner: false,
  ...overrides,
});

const race = (overrides: Partial<RaceDto> = {}): RaceDto => ({
  id: 'r-1',
  status: 'running',
  fromCity: 'lagos',
  toCity: 'abuja',
  challengerId: 'c-me',
  createdAt: NOW - 100,
  startedAt: NOW - 50,
  expiresAt: NOW + 4_000,
  decided: false,
  racers: [racer({ characterId: 'c-me', name: 'Me Myself', isYou: true, isChallenger: true }), racer()],
  ...overrides,
});

const overviewOf = (overrides: Partial<RacesOverviewDto> = {}): RacesOverviewDto => ({
  active: null,
  invitations: [],
  recent: [],
  friends: [
    { characterId: 'c-1', handle: 'ada', name: 'Ada Okafor', cityId: 'lagos', available: true, reason: null },
    { characterId: 'c-2', handle: 'tolu', name: 'Tolu Bello', cityId: 'abuja', available: false, reason: 'In Abuja' },
  ],
  canChallenge: true,
  blocker: null,
  cityId: 'lagos',
  toCity: 'abuja',
  maxRacers: 4,
  durationDays: 3,
  ...overrides,
});

let client: QueryClient;

function renderTab() {
  return render(
    <QueryClientProvider client={client}>
      <RaceTab />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  http.get.mockReset();
  http.post.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useUi.setState({ phoneOpen: true, phoneApp: 'flights', phoneParam: 'race' });
});

describe('race formatting', () => {
  it('reads the deep link: the tab alone, or a friend to pre-pick', () => {
    expect(raceDeepLink('race')).toEqual({ open: true, friendId: null });
    expect(raceDeepLink('race:abc')).toEqual({ open: true, friendId: 'abc' });
    expect(raceDeepLink('counter')).toEqual({ open: false, friendId: null });
    expect(raceDeepLink(null)).toEqual({ open: false, friendId: null });
  });

  it('labels a race by where it stands', () => {
    expect(raceChip(race({ status: 'pending', startedAt: null }), NOW).label).toBe('Waiting for answers');
    expect(raceChip(race(), NOW).label).toBe('Race on');
    expect(raceChip(race({ decided: true }), NOW).label).toBe('Winner known');
    expect(raceChip(race({ status: 'finished' }), NOW).label).toBe('Finished');
    expect(raceClock(race(), NOW)).toBe('Ends in 2d 18h');
    expect(raceClock(race({ status: 'expired' }), NOW)).toBeNull();
  });

  it('describes each racer: time, how they travelled and place, or still on the way', () => {
    const done = racer({ status: 'finished', place: 1, winner: true, elapsedMinutes: 72, how: 'private', howLabel: 'Phenom 300E · 5N-ABC', finishedAt: NOW });
    expect(racerLine(race(), done, NOW)).toBe('1st · 1h 12m · Phenom 300E · 5N-ABC');
    expect(racerLine(race(), racer(), NOW)).toBe('On the way');
    expect(racerLine(race({ status: 'expired' }), racer(), NOW)).toBe('Did not finish');
    expect(racerLine(race({ status: 'pending' }), racer({ status: 'invited' }), NOW)).toBe('Deciding');
  });
});

describe('RaceTab', () => {
  it('lets you pick available friends only and challenges them with an idempotency key', async () => {
    http.get.mockResolvedValue(overviewOf());
    http.post.mockResolvedValue({ race: race({ status: 'pending', startedAt: null }), overview: overviewOf() });
    renderTab();
    expect(await screen.findByText('Race a friend to Abuja')).toBeTruthy();
    const away = screen.getByRole('checkbox', { name: /Tolu Bello/ }) as HTMLButtonElement;
    expect(away.disabled).toBe(true);
    expect(within(away).getByText('In Abuja')).toBeTruthy();
    const challenge = screen.getByRole('button', { name: /^Challenge friends to Abuja/ }) as HTMLButtonElement;
    expect(challenge.disabled).toBe(true);

    fireEvent.click(screen.getByRole('checkbox', { name: /Ada Okafor/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Challenge 1 friend to Abuja/ }));
    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    const [path, body] = http.post.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('/races');
    expect(body).toMatchObject({ friendIds: ['c-1'] });
    expect(typeof body.idempotencyKey).toBe('string');
  });

  it('pre-picks the friend from a profile deep link', async () => {
    useUi.setState({ phoneParam: 'race:c-1' });
    http.get.mockResolvedValue(overviewOf());
    renderTab();
    const ada = await screen.findByRole('checkbox', { name: /Ada Okafor/ });
    expect(ada.getAttribute('aria-checked')).toBe('true');
  });

  it('shows your race with each racer and lets the challenger call off a pending one', async () => {
    http.get.mockResolvedValue(overviewOf({ active: race({ status: 'pending', startedAt: null, racers: [racer({ characterId: 'c-me', name: 'Me', isYou: true, isChallenger: true }), racer({ status: 'invited' })] }) }));
    http.post.mockResolvedValue({ race: race({ status: 'cancelled' }), overview: overviewOf() });
    renderTab();
    const list = await screen.findByRole('list', { name: /Racers, Lagos to Abuja/ });
    expect(within(list).getByText('You')).toBeTruthy();
    expect(within(list).getByText('Deciding')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Call it off' }));
    await waitFor(() => expect(http.post).toHaveBeenCalledWith('/races/r-1/cancellation'));
  });

  it('answers a challenge, and holds the answer while you are in another race', async () => {
    const challenge = race({ id: 'r-9', status: 'pending', startedAt: null, racers: [racer({ characterId: 'c-ch', name: 'Chidi Eze', isChallenger: true }), racer({ characterId: 'c-me', name: 'Me', isYou: true, status: 'invited' })] });
    http.get.mockResolvedValue(overviewOf({ invitations: [challenge] }));
    http.post.mockResolvedValue({ race: race({ id: 'r-9' }), overview: overviewOf() });
    renderTab();
    const accept = await screen.findByRole('button', { name: 'I’m in' });
    expect((accept as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(accept);
    await waitFor(() => expect(http.post).toHaveBeenCalledWith('/races/r-9/acceptance'));
  });

  it('shows results with places, times and how each travelled', async () => {
    const results = race({
      status: 'finished',
      decided: true,
      racers: [
        racer({ characterId: 'c-me', name: 'Me', isYou: true, status: 'finished', place: 2, elapsedMinutes: 600, how: 'coach', howLabel: 'Interstate coach' }),
        racer({ status: 'finished', place: 1, winner: true, elapsedMinutes: 70, how: 'private', howLabel: 'Gulfstream G650ER · 5N-ABC' }),
      ],
    });
    http.get.mockResolvedValue(overviewOf({ recent: [results] }));
    renderTab();
    expect(await screen.findByText('2nd · 10h 00m · Interstate coach')).toBeTruthy();
    expect(screen.getByText('1st · 1h 10m · Gulfstream G650ER · 5N-ABC')).toBeTruthy();
    expect(screen.getByLabelText('Winner')).toBeTruthy();
  });
});
