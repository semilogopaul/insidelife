'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toDateParts, type VenueType } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { toast } from '@/common/components';
import { gameClock } from '@/common/game/game-clock';
import { gameEvents } from '@/common/game/game-events';
import { useNavigation } from '@/common/game/navigation-store';
import { useSnapshot } from '@/common/game/snapshot';
import { useUi } from '@/common/game/ui-store';
import { useWorld } from '@/common/game/world-store';
import { nearestVenueOfTypes, playerPoint } from '../services/directions';
import { goalsApi } from '../services/goals.api';

export const progressionKey = queryKeys.domain('progression');
export const achievementsKey = queryKeys.domain('progression', 'achievements');

export function useProgression() {
  return useQuery({ queryKey: progressionKey, queryFn: goalsApi.overview, staleTime: 15_000 });
}

export function useAchievements(enabled: boolean) {
  return useQuery({ queryKey: achievementsKey, queryFn: goalsApi.achievements, enabled, staleTime: 30_000 });
}

export function useClaimDailyWelcome() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: goalsApi.claimDailyWelcome,
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.snapshot });
      void client.invalidateQueries({ queryKey: progressionKey });
    },
  });
}

/** "Get directions": GPS to the nearest venue of the given types, then close the phone so the player can go. */
export function useGoalDirections() {
  const { data: snapshot } = useSnapshot();
  const setDestination = useNavigation((state) => state.setDestination);
  const closePhone = useUi((state) => state.closePhone);
  return (types: readonly VenueType[]): void => {
    if (!snapshot || types.length === 0) return;
    const from = playerPoint({
      live: useWorld.getState().position,
      locationId: snapshot.character.locationId,
      characterId: snapshot.character.id,
      homePropertyId: snapshot.character.homePropertyId,
      homeDistrictId: snapshot.character.homeDistrictId,
    });
    const nearest = nearestVenueOfTypes(types, from, toDateParts(gameClock.now()).hour);
    if (!nearest) {
      toast({ title: 'No place like that in Lagos yet', body: 'Check the Map app for somewhere close.', tone: 'neutral' });
      return;
    }
    setDestination(nearest.venue.id, nearest.venue.name);
    gameEvents.emit('sfx', { id: 'ui-success' });
    toast({ title: `GPS set: ${nearest.venue.name}`, body: nearest.open ? 'Follow the route on your map.' : 'Heads up — it may be closed when you arrive.', tone: 'neutral' });
    closePhone();
  };
}
