'use client';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { CharacterSnapshotDto } from '@insidelife/shared';
import { api } from '@/common/api/http';
import { queryKeys } from '@/common/api/query-keys';
import { gameClock } from '@/common/game/game-clock';
import { useSnapshot } from '@/common/game/snapshot';
import { RideArrivalWatch } from './ride-arrival';

const TICK_MS = 1_000;
const RESYNC_TIMEOUT_MS = 20_000;

/** Write a snapshot unless the cache already holds a newer one. */
export function acceptSnapshot(client: QueryClient, fresh: CharacterSnapshotDto): void {
  const current = client.getQueryData<CharacterSnapshotDto>(queryKeys.snapshot);
  if (current && current.asOf > fresh.asOf) return;
  client.setQueryData(queryKeys.snapshot, fresh);
}

/**
 * While a booked ride is on (`snapshot.travel`), bring the client to the server's view once it's due: a snapshot
 * refetch that never cancels the one in flight, then direct resyncs if the ride is still showing (see
 * `RideArrivalWatch`). Arrival then flips the world to the destination (inside, engine audio off) whatever UI is
 * open. Timer-driven, so it works with the phone open, the canvas paused or the ride layer not mounted.
 */
export function useRideArrival(): void {
  const client = useQueryClient();
  const { data: snapshot } = useSnapshot();
  const travel = snapshot?.travel ?? null;
  const rideKey = travel ? `${travel.departAt}:${travel.toLocationId}` : null;
  const arriveAt = travel?.arriveAt ?? null;

  useEffect(() => {
    if (rideKey === null || arriveAt === null) return;
    const watch = new RideArrivalWatch(rideKey);
    let alive = true;
    let resyncing = false;
    const tick = (): void => {
      if (!gameClock.ready) return;
      const step = watch.step({
        gameNow: gameClock.now(),
        arriveAt,
        realNow: Date.now(),
        fetching: client.isFetching({ queryKey: queryKeys.snapshot }) > 0,
        resyncing,
      });
      if (step === 'refetch') {
        void client.invalidateQueries({ queryKey: queryKeys.snapshot }, { cancelRefetch: false });
      } else if (step === 'resync') {
        resyncing = true;
        const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(RESYNC_TIMEOUT_MS) : undefined;
        api
          .get<CharacterSnapshotDto>('/characters/me', { signal })
          .then((fresh) => {
            if (alive) acceptSnapshot(client, fresh);
          })
          .catch(() => undefined)
          .finally(() => {
            resyncing = false;
          });
      }
    };
    const id = window.setInterval(tick, TICK_MS);
    tick();
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [client, rideKey, arriveAt]);
}
