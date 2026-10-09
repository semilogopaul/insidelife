import { describe, expect, it } from 'vitest';
import { RIDE_REFETCH_GAP_MS, RIDE_RESYNC_AFTER_MS, RIDE_RESYNC_GAP_MS, RideArrivalWatch, type RideArrivalInputs } from '../flow/ride-arrival';

const ARRIVE = 1_000;
const at = (realNow: number, overrides: Partial<RideArrivalInputs> = {}): RideArrivalInputs => ({
  gameNow: ARRIVE,
  arriveAt: ARRIVE,
  realNow,
  fetching: false,
  resyncing: false,
  ...overrides,
});

describe('RideArrivalWatch', () => {
  it('waits while the ride is still on the road', () => {
    const watch = new RideArrivalWatch('ride');
    expect(watch.step(at(0, { gameNow: ARRIVE - 1 }))).toBe('wait');
    expect(watch.overdueMs(0)).toBe(0);
  });

  it('asks for the snapshot as soon as the ride is due, then every few seconds', () => {
    const watch = new RideArrivalWatch('ride');
    expect(watch.step(at(0))).toBe('refetch');
    expect(watch.step(at(RIDE_REFETCH_GAP_MS - 1))).toBe('wait');
    expect(watch.step(at(RIDE_REFETCH_GAP_MS))).toBe('refetch');
  });

  it('never asks again while an answer is still on its way (a slow link must not cancel it)', () => {
    const watch = new RideArrivalWatch('ride');
    expect(watch.step(at(0))).toBe('refetch');
    // A 9 s round trip: nothing new is asked, so the one request in flight is the one that lands.
    for (let t = 1_000; t < 9_000; t += 1_000) expect(watch.step(at(t, { fetching: true }))).toBe('wait');
    expect(watch.step(at(9_000))).toBe('refetch');
  });

  it('resyncs directly when the ride is still showing long after arrival, one at a time', () => {
    const watch = new RideArrivalWatch('ride');
    watch.step(at(0));
    expect(watch.step(at(RIDE_RESYNC_AFTER_MS, { fetching: true }))).toBe('resync');
    expect(watch.overdueMs(RIDE_RESYNC_AFTER_MS)).toBe(RIDE_RESYNC_AFTER_MS);
    // While the resync is out, nothing else goes.
    expect(watch.step(at(RIDE_RESYNC_AFTER_MS + RIDE_RESYNC_GAP_MS, { fetching: true, resyncing: true }))).toBe('wait');
    expect(watch.step(at(RIDE_RESYNC_AFTER_MS + RIDE_RESYNC_GAP_MS, { fetching: true }))).toBe('resync');
  });
});
