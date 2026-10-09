'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import {
  computeMood,
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

/** Refetch a little before the planned timeline runs out (≈ 1 game day ahead = 12 real minutes). */
const REFETCH_MARGIN_MINUTES = 30;

/**
 * The character snapshot — the single source of truth for the HUD and world. Server state only (TanStack Query);
 * never copied into Zustand.
 */
export function useSnapshot() {
  const authenticated = useSession((state) => state.status === 'authenticated');
  const query = useQuery({
    queryKey: queryKeys.snapshot,
    queryFn: () => api.get<CharacterSnapshotDto>('/characters/me'),
    enabled: authenticated,
    staleTime: 60_000,
    retry: (failures, error) => !(error instanceof ApiError && (error.code === 'NO_CHARACTER' || error.isAuth)) && failures < 2,
  });

  const client = useQueryClient();
  const lastEnd = query.data?.timeline.at(-1)?.endsAt;
  useEffect(() => {
    if (lastEnd === undefined || !gameClock.ready) return;
    const due = gameClock.localMsAt(lastEnd - REFETCH_MARGIN_MINUTES) - Date.now();
    const id = window.setTimeout(() => void client.invalidateQueries({ queryKey: queryKeys.snapshot }), Math.max(5_000, due));
    return () => window.clearTimeout(id);
  }, [lastEnd, client]);

  return query;
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
    onSuccess: (snapshot) => client.setQueryData(queryKeys.snapshot, snapshot),
  });
}
