'use client';

import { useQuery } from '@tanstack/react-query';
import type { Habit } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { useSnapshotMutation } from '@/common/game/snapshot';
import { habitsApi } from '../services/me.api';

/** Capability tags from your belongings (laptop, tv, console…) — for habit requirements. */
export function useItemTags() {
  return useQuery({ queryKey: queryKeys.domain('inventory', 'tags'), queryFn: habitsApi.inventoryTags, staleTime: 60_000 });
}

/** Replace the whole habit list (`[]` clears it); the response is a fresh snapshot. */
export function useSaveHabits() {
  return useSnapshotMutation((habits: readonly Habit[]) => habitsApi.save(habits));
}
