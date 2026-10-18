'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { GameMinute, OwnedAircraftDto } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { gameClock } from '@/common/game/game-clock';

/** The earliest landing still ahead of `now` among planes in the air (a ferry delivery or a flight of yours), or null. */
export function nextLanding(planes: readonly Pick<OwnedAircraftDto, 'airborne' | 'arrivesAt'>[], now: GameMinute): GameMinute | null {
  let next: GameMinute | null = null;
  for (const plane of planes) {
    if (!plane.airborne || plane.arrivesAt === null || plane.arrivesAt <= now) continue;
    if (next === null || plane.arrivesAt < next) next = plane.arrivesAt;
  }
  return next;
}

/** A plane the server listed as in the air whose landing time has passed on the game clock: it is parked now. */
export function hasLanded(plane: Pick<OwnedAircraftDto, 'airborne' | 'arrivesAt'>, now: GameMinute): boolean {
  return plane.airborne && plane.arrivesAt !== null && plane.arrivesAt <= now;
}

/** Longest single wait (ms): a far-off landing is re-checked now and then rather than held in one huge timer. */
const MAX_WAIT_MS = 5 * 60_000;

/**
 * Refetch the fleet (and the apron) the moment a plane's landing time arrives, so a ferried or flown aircraft appears
 * on the apron and in the Hangar when the clock says it lands, not whenever something else happens to refetch.
 */
export function useLandingRefresh(planes: readonly Pick<OwnedAircraftDto, 'airborne' | 'arrivesAt'>[]): void {
  const client = useQueryClient();
  // Fleet data is replaced on every refetch, so the effect re-arms against the newest landing.
  useEffect(() => {
    if (!gameClock.ready) return;
    const landing = nextLanding(planes, gameClock.now());
    if (landing === null) return;
    const wait = Math.min(MAX_WAIT_MS, Math.max(250, gameClock.localMsAt(landing) - Date.now() + 400));
    const timer = setTimeout(() => {
      void client.invalidateQueries({ queryKey: queryKeys.domain('hangar') });
      void client.invalidateQueries({ queryKey: queryKeys.domain('aviation', 'apron') });
      void client.invalidateQueries({ queryKey: queryKeys.snapshot });
    }, wait);
    return () => clearTimeout(timer);
  }, [planes, client]);
}
