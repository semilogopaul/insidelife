/**
 * Reconciling a booked ride with the server once it's due (pure: no React, no timers, no network).
 *
 * The server settles a ride lazily, on the next request after `arriveAt`, and puts the character inside the
 * destination; the client only learns it from a fresh snapshot. Asking for one every few seconds and *cancelling the
 * request still in flight* (TanStack's default `invalidateQueries`) never converges on a slow link: once a round trip
 * takes longer than the gap between asks, every answer is thrown away and the requests pile up on the server's row
 * lock, so the player stays in the vehicle with the engine running. This watch therefore:
 * - **refetches** after arrival only when no snapshot request is in flight, and never cancels one;
 * - **resyncs** (a direct request whose answer is written to the cache) when the ride is still showing well after
 *   arrival, in case the query itself is stuck (in a long retry back-off, or its observer was cancelled).
 * It's driven by a plain interval, not the 3D frame loop, so a paused or stalled canvas can't hold it up either.
 */

/** Real ms between snapshot asks once the ride is due (each waits for the previous answer). */
export const RIDE_REFETCH_GAP_MS = 3_000;
/** Real ms after the ride is due before a direct resync is tried. */
export const RIDE_RESYNC_AFTER_MS = 12_000;
/** Real ms between direct resyncs (each one in flight blocks the next). */
export const RIDE_RESYNC_GAP_MS = 10_000;

export type RideArrivalStep = 'wait' | 'refetch' | 'resync';

export interface RideArrivalInputs {
  /** Game minute now. */
  readonly gameNow: number;
  /** Game minute the ride arrives (`travel.arriveAt`). */
  readonly arriveAt: number;
  /** Real ms now (`Date.now()` or `performance.now()`, consistently). */
  readonly realNow: number;
  /** A snapshot request is in flight (the query is fetching). */
  readonly fetching: boolean;
  /** A direct resync request is in flight. */
  readonly resyncing: boolean;
}

/** Tracks one ride (by its departure); `step` says what to do on each tick. */
export class RideArrivalWatch {
  private dueSince: number | null = null;
  private lastAsk = Number.NEGATIVE_INFINITY;
  private lastResync = Number.NEGATIVE_INFINITY;

  constructor(readonly rideKey: string) {}

  step(inputs: RideArrivalInputs): RideArrivalStep {
    if (inputs.gameNow < inputs.arriveAt) return 'wait';
    this.dueSince ??= inputs.realNow;
    const overdue = inputs.realNow - this.dueSince;
    if (overdue >= RIDE_RESYNC_AFTER_MS && !inputs.resyncing && inputs.realNow - this.lastResync >= RIDE_RESYNC_GAP_MS) {
      this.lastResync = inputs.realNow;
      return 'resync';
    }
    if (!inputs.fetching && !inputs.resyncing && inputs.realNow - this.lastAsk >= RIDE_REFETCH_GAP_MS) {
      this.lastAsk = inputs.realNow;
      return 'refetch';
    }
    return 'wait';
  }

  /** Real ms the ride has been due (0 before arrival). */
  overdueMs(realNow: number): number {
    return this.dueSince === null ? 0 : Math.max(0, realNow - this.dueSince);
  }
}
