'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { GameMinute, WorldClockDto, WorldStateDto } from '@insidelife/shared';
import { api } from '@/common/api/http';
import { queryKeys } from '@/common/api/query-keys';
import { gameClock } from './game-clock';

/** Fetch and apply the clock config once per session (re-synced hourly to absorb drift). */
export function useClockSync(): boolean {
  const { data } = useQuery({
    queryKey: queryKeys.clock,
    queryFn: async () => {
      const started = Date.now();
      const dto = await api.get<WorldClockDto>('/world/clock', { anonymous: true });
      gameClock.sync(dto, started, Date.now());
      return dto;
    },
    staleTime: 60 * 60_000,
    refetchInterval: 60 * 60_000,
    // The game can't start without the clock: while the API is down (a restart), keep trying, backing off to 30 s.
    retry: true,
    retryDelay: (attempt) => Math.min(30_000, 1_000 * 2 ** attempt),
  });
  return data !== undefined;
}

/** Re-renders every `intervalMs` with the current game minute. Use sparingly (HUD clock, need bars). */
export function useGameMinute(intervalMs = 1000): GameMinute {
  const [minute, setMinute] = useState(() => gameClock.now());
  useEffect(() => {
    const tick = (): void => setMinute(gameClock.now());
    tick();
    const unsubscribe = gameClock.subscribe(tick);
    const id = window.setInterval(tick, intervalMs);
    return () => {
      unsubscribe();
      window.clearInterval(id);
    };
  }, [intervalMs]);
  return minute;
}

/** Weather, economy and world events (cached briefly; cheap and public). */
export function useWorldState() {
  return useQuery({
    queryKey: queryKeys.worldState,
    queryFn: () => api.get<WorldStateDto>('/world/state', { anonymous: true }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
