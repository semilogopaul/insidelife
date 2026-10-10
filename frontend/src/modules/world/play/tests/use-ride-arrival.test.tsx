import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterSnapshotDto } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';

/**
 * The ride-arrival bug: on a slow link every snapshot request took longer than the 3 s re-ask, each re-ask cancelled
 * the one in flight, and the player stayed in the danfo (engine running) at the destination forever.
 */

const clock = vi.hoisted(() => ({ minute: 0 }));
const fetcher = vi.hoisted(() => ({ query: vi.fn(), direct: vi.fn() }));

vi.mock('@/common/game/game-clock', () => ({
  gameClock: {
    get ready() {
      return true;
    },
    now: () => clock.minute,
  },
}));
vi.mock('@/common/game/snapshot', () => ({
  useSnapshot: () => useQuery({ queryKey: queryKeys.snapshot, queryFn: () => fetcher.query() as Promise<CharacterSnapshotDto>, staleTime: 60_000, retry: false }),
}));
vi.mock('@/common/api/http', () => ({ api: { get: (...args: unknown[]) => fetcher.direct(...args) } }));

const { useRideArrival } = await import('../flow/use-ride-arrival');

const riding = (asOf: number): CharacterSnapshotDto =>
  ({ asOf, travel: { fromLocationId: 'unilag', toLocationId: 'lekki-car-mart', mode: 'danfo', departAt: 0, arriveAt: 100, fare: 400 }, character: { locationId: 'unilag' } }) as unknown as CharacterSnapshotDto;
const arrived = (asOf: number): CharacterSnapshotDto => ({ asOf, travel: null, character: { locationId: 'lekki-car-mart' } }) as unknown as CharacterSnapshotDto;

function Probe() {
  useRideArrival();
  return null;
}

function mount(client: QueryClient): void {
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  render(<Probe />, { wrapper });
}

/** A promise we resolve by hand (a slow network). */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

describe('useRideArrival', () => {
  let client: QueryClient;
  beforeEach(() => {
    vi.useFakeTimers();
    clock.minute = 50;
    fetcher.query.mockReset();
    fetcher.direct.mockReset();
    client = new QueryClient();
    client.setQueryData(queryKeys.snapshot, riding(0));
  });
  afterEach(() => {
    vi.useRealTimers();
    client.clear();
  });

  it('does nothing until the ride is due', async () => {
    mount(client);
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(fetcher.query).not.toHaveBeenCalled();
  });

  it('keeps one slow request in flight instead of cancelling it, and arrives when it lands', async () => {
    const slow = deferred<CharacterSnapshotDto>();
    fetcher.query.mockReturnValue(slow.promise);
    mount(client);
    clock.minute = 100;
    // 9 s of a slow link: exactly one request goes out.
    await act(() => vi.advanceTimersByTimeAsync(9_000));
    expect(fetcher.query).toHaveBeenCalledTimes(1);
    await act(async () => slow.resolve(arrived(100)));
    expect(client.getQueryData<CharacterSnapshotDto>(queryKeys.snapshot)?.travel).toBeNull();
  });

  it('resyncs directly when the query never answers, and the arrival sticks', async () => {
    fetcher.query.mockReturnValue(new Promise(() => undefined));
    fetcher.direct.mockResolvedValue(arrived(120));
    mount(client);
    clock.minute = 100;
    await act(() => vi.advanceTimersByTimeAsync(13_000));
    expect(fetcher.direct).toHaveBeenCalledWith('/characters/me', expect.anything());
    const snapshot = client.getQueryData<CharacterSnapshotDto>(queryKeys.snapshot);
    expect(snapshot?.travel).toBeNull();
    expect(snapshot?.character.locationId).toBe('lekki-car-mart');
  });

  it('never overwrites a newer snapshot with an older resync answer', async () => {
    fetcher.query.mockReturnValue(new Promise(() => undefined));
    const late = deferred<CharacterSnapshotDto>();
    fetcher.direct.mockReturnValue(late.promise);
    mount(client);
    clock.minute = 100;
    await act(() => vi.advanceTimersByTimeAsync(13_000));
    client.setQueryData(queryKeys.snapshot, arrived(130));
    await act(async () => late.resolve(riding(110)));
    expect(client.getQueryData<CharacterSnapshotDto>(queryKeys.snapshot)?.asOf).toBe(130);
  });
});
