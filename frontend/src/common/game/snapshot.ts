'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import {
  computeMood,
  isIntercityMode,
  isStreetLocation,
  needsAlongTimeline,
  type CharacterSnapshotDto,
  type GameMinute,
  type Needs,
  type TimelineSegmentDto,
} from '@insidelife/shared';
import { ApiError } from '@/common/api/api-error';
import { api } from '@/common/api/http';
import { queryKeys } from '@/common/api/query-keys';
import { useSession } from '@/common/auth/session-store';
import { gameClock } from './game-clock';

/**
 * A definite answer (no character, signed out, email to confirm, any other 4xx) is final. Network trouble, 5xx (the API
 * restarting) and a busy server (503 SERVER_BUSY, 429) keep retrying, backing off to 30 s, so "Retrying…" on the loading
 * screen is true and the snapshot keeps refreshing once the server has room again.
 */
export function retrySnapshot(_failures: number, error: unknown): boolean {
  return !(error instanceof ApiError && error.status >= 400 && error.status < 500 && !error.isBusy);
}

/** Refetch a little before the planned timeline runs out (≈ 1 game day ahead = 24 real minutes at ×60). */
const REFETCH_MARGIN_MINUTES = 30;

/**
 * The character snapshot — the single source of truth for the HUD and world. Server state only (TanStack Query);
 * never copied into Zustand.
 */
export function useSnapshot() {
  const authenticated = useSession((state) => state.status === 'authenticated');
  const query = useQuery({
    queryKey: queryKeys.snapshot,
    queryFn: ({ signal }) => api.get<CharacterSnapshotDto>('/characters/me', { signal }),
    enabled: authenticated,
    staleTime: 60_000,
    retry: retrySnapshot,
    retryDelay: (attempt) => Math.min(30_000, 1_000 * 2 ** attempt),
  });

  const client = useQueryClient();
  const lastEnd = query.data?.timeline.at(-1)?.endsAt;
  useEffect(() => {
    if (lastEnd === undefined || !gameClock.ready) return;
    const due = gameClock.localMsAt(lastEnd - REFETCH_MARGIN_MINUTES) - Date.now();
    const id = window.setTimeout(() => void client.invalidateQueries({ queryKey: queryKeys.snapshot }), Math.max(5_000, due));
    return () => window.clearTimeout(id);
  }, [lastEnd, client]);

  // The moment the current activity ends the snapshot is stale (the HUD would still say "busy"): refresh it then.
  const endsAt = query.data?.timeline[0]?.endsAt;
  useEffect(() => {
    if (endsAt === undefined || !gameClock.ready) return;
    const delay = activityEndRefreshDelayMs(gameClock.localMsAt(endsAt) - Date.now());
    const id = window.setTimeout(() => void client.invalidateQueries({ queryKey: queryKeys.snapshot }), delay);
    return () => window.clearTimeout(id);
  }, [endsAt, client]);

  return query;
}

/** When to refetch after the current activity: just past its end, never in a tight loop (≥ 1 s), at most a day away. */
export function activityEndRefreshDelayMs(msUntilEnd: number): number {
  return Math.min(24 * 60 * 60_000, Math.max(1_000, msUntilEnd + 500));
}

/**
 * The timeline segment covering game time `t`. A `t` a little before the timeline (a UI clock that ticks every few
 * seconds, just after a fresh snapshot) gets the first segment; past the end, the last.
 */
export function segmentAt(snapshot: CharacterSnapshotDto, t: GameMinute): TimelineSegmentDto | undefined {
  const first = snapshot.timeline[0];
  if (first && t < first.startsAt) return first;
  return snapshot.timeline.find((segment) => segment.startsAt <= t && t < segment.endsAt) ?? snapshot.timeline.at(-1);
}

/** Needs and mood projected to game time `t` with the same closed-form model the server uses. */
export function useProjectedNeeds(snapshot: CharacterSnapshotDto | undefined, t: GameMinute): { needs: Needs; mood: number } | null {
  return useMemo(() => {
    if (!snapshot) return null;
    const needs = needsAlongTimeline(snapshot.character.needs, snapshot.asOf, snapshot.timeline, t);
    const modifier = snapshot.character.mood - computeMood(snapshot.character.needs);
    return { needs, mood: Math.max(0, Math.min(100, Math.round(computeMood(needs) + modifier))) };
  }, [snapshot, t]);
}

/**
 * Mutation for endpoints that respond with a fresh snapshot: writes it straight into the cache (no refetch).
 */
export function useSnapshotMutation<TVariables>(mutationFn: (variables: TVariables) => Promise<CharacterSnapshotDto>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (snapshot) => {
      // A refetch started before this command would land after it with older state (and flip the world back).
      await client.cancelQueries({ queryKey: queryKeys.snapshot });
      client.setQueryData(queryKeys.snapshot, snapshot);
    },
  });
}

/**
 * Writes a snapshot that arrived nested in another answer (e.g. a flights action returns `{ overview, snapshot }`) into
 * the cache, the same way `useSnapshotMutation` does: cancel in-flight refetches first, no refetch after.
 */
export function useWriteSnapshot(): (snapshot: CharacterSnapshotDto) => Promise<void> {
  const client = useQueryClient();
  return async (snapshot) => {
    await client.cancelQueries({ queryKey: queryKeys.snapshot });
    client.setQueryData(queryKeys.snapshot, snapshot);
  };
}

/** Where the world should be: inside a place, out on the street, or riding to somewhere. */
export type WorldPlace =
  | { readonly kind: 'inside'; readonly locationId: string }
  | { readonly kind: 'outside' }
  | { readonly kind: 'riding'; readonly toLocationId: string };

/** What the snapshot itself says (what the 3D world renders). */
export function snapshotPlace(snapshot: CharacterSnapshotDto): WorldPlace {
  // On a flight or the coach you sit inside where you boarded (the city has no road to where you are going).
  if (snapshot.travel && isIntercityMode(snapshot.travel.mode)) return { kind: 'inside', locationId: snapshot.travel.fromLocationId };
  if (snapshot.travel) return { kind: 'riding', toLocationId: snapshot.travel.toLocationId };
  const locationId = snapshot.character.locationId;
  return isStreetLocation(locationId) ? { kind: 'outside' } : { kind: 'inside', locationId };
}

/** What the timeline says at game time `t` (what the HUD banner and the audio follow). */
export function timelinePlace(snapshot: CharacterSnapshotDto, t: GameMinute): WorldPlace | null {
  const segment = segmentAt(snapshot, t);
  if (!segment) return null;
  if (segment.kind === 'commute' || segment.kind === 'travel') return { kind: 'riding', toLocationId: segment.locationId };
  // A flight segment is located at its destination, but the world shows the departure venue until the landing.
  if (segment.kind === 'flight') return snapshot.travel ? { kind: 'inside', locationId: snapshot.travel.fromLocationId } : { kind: 'inside', locationId: segment.locationId };
  return isStreetLocation(segment.locationId) ? { kind: 'outside' } : { kind: 'inside', locationId: segment.locationId };
}

/**
 * The world and the timeline disagree about where the character is: e.g. the timeline has them on a bus home (HUD
 * "Heading to home", road audio) while the snapshot still renders the classroom, or a ride the timeline says has
 * arrived. The server moved on; the snapshot is stale and must be refetched.
 */
export function placesDisagree(snapshot: CharacterSnapshotDto, t: GameMinute): boolean {
  const rendered = snapshotPlace(snapshot);
  const planned = timelinePlace(snapshot, t);
  if (!planned || planned.kind !== rendered.kind) return planned !== null;
  if (planned.kind === 'inside' && rendered.kind === 'inside') return planned.locationId !== rendered.locationId;
  if (planned.kind === 'riding' && rendered.kind === 'riding') return planned.toLocationId !== rendered.toLocationId;
  return false;
}

/** How long a disagreement may last before the snapshot is refetched, and the least time between two refetches. */
export const RESYNC_AFTER_MS = 2_000;
export const RESYNC_BACKOFF_MS = 5_000;

/**
 * Consistency watchdog: when what the world renders (the snapshot) and what the timeline says (HUD, audio) disagree
 * for more than ~2 s, refetch the snapshot so the scene follows the server (leave the interior for the ride, or the
 * ride for the destination). Never hangs on an open sheet: it only touches the query cache.
 */
export function useSnapshotConsistency(): void {
  const client = useQueryClient();
  const { data: snapshot } = useSnapshot();
  useEffect(() => {
    if (!snapshot || !gameClock.ready) return;
    let since: number | null = null;
    let lastResync = 0;
    const id = window.setInterval(() => {
      const now = Date.now();
      if (!placesDisagree(snapshot, gameClock.now())) {
        since = null;
        return;
      }
      since ??= now;
      if (now - since < RESYNC_AFTER_MS || now - lastResync < RESYNC_BACKOFF_MS) return;
      lastResync = now;
      void client.invalidateQueries({ queryKey: queryKeys.snapshot }, { cancelRefetch: false });
    }, 500);
    return () => window.clearInterval(id);
  }, [snapshot, client]);
}
