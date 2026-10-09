'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { NightOutDto, VenueMomentDto } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { gameClock } from '@/common/game/game-clock';
import { useRealtimeEvent } from '@/common/realtime/use-realtime';
import { nextMomentChange, useVenueMoments } from './moments-store';
import { nightOutApi } from './night-out.api';

export const nightOutKey = (venueId: string) => queryKeys.domain('social', 'night-out', venueId);

/** The Night out menu, what's playing or queued here and your night so far (null venue: nothing to load). */
export function useNightOut(venueId: string | null) {
  return useQuery<NightOutDto>({
    queryKey: nightOutKey(venueId ?? ''),
    queryFn: () => nightOutApi.view(venueId ?? ''),
    enabled: venueId !== null,
    staleTime: 30_000,
    retry: false,
  });
}

/**
 * Keep the moments store on the room you're in: load what's queued or playing when you walk in (late arrivals still
 * see the shoutout queue and the VIP sign), then add every `venue:moment` the server pushes. Mount once (the HUD
 * layer does); everyone else reads `useVenueMoments` / `useMomentClock`.
 */
export function useVenueMomentsFeed(venueId: string | null): void {
  const enter = useVenueMoments((state) => state.enter);
  useEffect(() => enter(venueId), [enter, venueId]);
  const { data } = useNightOut(venueId);
  useEffect(() => {
    if (data && data.venueId === venueId) useVenueMoments.getState().add(data.moments, gameClock.serverNow());
  }, [data, venueId]);
  useRealtimeEvent('venue:moment', (moment) => useVenueMoments.getState().add([moment], gameClock.serverNow()));
}

/** Push a moment you just bought (the realtime echo is deduplicated). */
export function addOwnMoment(moment: VenueMomentDto): void {
  useVenueMoments.getState().add([moment], gameClock.serverNow());
}

/**
 * The room's moments and the server-clock time, re-rendering only when something starts or stops (one timer, no
 * polling). Use it for DOM; 3D reads `gameClock.serverNow()` in `useFrame`.
 */
export function useMomentClock(): { readonly moments: readonly VenueMomentDto[]; readonly now: number } {
  const moments = useVenueMoments((state) => state.moments);
  const [now, setNow] = useState(() => gameClock.serverNow());
  // New moments arrived: catch the clock up in the same render (React's "adjust state on prop change" pattern).
  const [seen, setSeen] = useState(moments);
  if (seen !== moments) {
    setSeen(moments);
    setNow(gameClock.serverNow());
  }
  useEffect(() => {
    const next = nextMomentChange(moments, now);
    if (next === null) return;
    const id = window.setTimeout(() => setNow(gameClock.serverNow()), Math.max(16, next - gameClock.serverNow() + 5));
    return () => window.clearTimeout(id);
  }, [moments, now]);
  return { moments, now };
}
