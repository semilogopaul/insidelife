'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RaceResultDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { queryKeys } from '@/common/api/query-keys';
import { toast } from '@/common/components';
import { useRealtimeEvent } from '@/common/realtime/use-realtime';
import { racesApi } from '../services/races.api';

export const racesKey = queryKeys.domain('flights', 'races');

/** Your race, challenges waiting for you, past results and the friends you can challenge. Refreshed when the server nudges. */
export function useRacesOverview() {
  const client = useQueryClient();
  useRealtimeEvent('character:invalidate', ({ reason }) => {
    if (reason === 'race') void client.invalidateQueries({ queryKey: racesKey });
  });
  return useQuery({ queryKey: racesKey, queryFn: racesApi.overview, staleTime: 10_000, refetchInterval: 20_000 });
}

export type RaceAction =
  | { readonly kind: 'create'; readonly friendIds: readonly string[] }
  | { readonly kind: 'accept'; readonly raceId: string }
  | { readonly kind: 'decline'; readonly raceId: string }
  | { readonly kind: 'cancel'; readonly raceId: string };

function send(action: RaceAction): Promise<RaceResultDto> {
  switch (action.kind) {
    case 'create':
      return racesApi.create(action.friendIds);
    case 'accept':
      return racesApi.accept(action.raceId);
    case 'decline':
      return racesApi.decline(action.raceId);
    case 'cancel':
      return racesApi.cancel(action.raceId);
  }
}

const DONE: Readonly<Record<RaceAction['kind'], string>> = {
  create: 'Challenge sent',
  accept: 'You’re in',
  decline: 'Said no',
  cancel: 'Race called off',
};

/** Every race action answers with the new overview: it goes straight into the cache. */
export function useRaceAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: (result, action) => {
      client.setQueryData(racesKey, result.overview);
      toast({ title: result.race.status === 'running' && action.kind === 'accept' ? 'Race on! Go!' : DONE[action.kind], tone: 'good' });
    },
    onError: (error) => toast({ title: 'Could not do that', body: errorMessage(error), tone: 'bad' }),
  });
}
