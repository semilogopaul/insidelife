'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AircraftPurchaseRequest } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { useCurrentPlace } from '@/common/hooks/use-current-place';
import { hangarApi } from '../services/hangar.api';

const hangarPrefix = queryKeys.domain('hangar');

/** Fleet, catalogue and licence progress — keyed by location (`atGat`, `buyHere` and the fly buttons depend on where you stand). */
export function useHangar() {
  const { locationId } = useCurrentPlace();
  return useQuery({
    queryKey: queryKeys.domain('hangar', locationId ?? 'unknown'),
    queryFn: hangarApi.overview,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

export function useHangarCommands() {
  const client = useQueryClient();
  const refresh = (): void => {
    void client.invalidateQueries({ queryKey: hangarPrefix });
    void client.invalidateQueries({ queryKey: queryKeys.snapshot });
  };
  return {
    purchase: useMutation({ mutationFn: (body: AircraftPurchaseRequest) => hangarApi.purchase(body), onSuccess: refresh }),
    sell: useMutation({ mutationFn: hangarApi.sell, onSuccess: refresh }),
    livery: useMutation({ mutationFn: (args: { id: string; base: string; accent: string }) => hangarApi.livery(args.id, { base: args.base, accent: args.accent }), onSuccess: refresh }),
    name: useMutation({ mutationFn: (args: { id: string; name: string }) => hangarApi.name(args.id, args.name), onSuccess: refresh }),
    registration: useMutation({ mutationFn: (args: { id: string; registration: string }) => hangarApi.registration(args.id, args.registration), onSuccess: refresh }),
    reinstate: useMutation({ mutationFn: hangarApi.reinstate, onSuccess: refresh }),
    fly: useMutation({ mutationFn: (args: { id: string; destination: 'mmia-gat' | 'naia-gat' }) => hangarApi.fly(args.id, { destination: args.destination }), onSuccess: refresh }),
    enrol: useMutation({ mutationFn: hangarApi.enrol, onSuccess: refresh }),
    lesson: useMutation({ mutationFn: hangarApi.lesson, onSuccess: refresh }),
    checkRide: useMutation({ mutationFn: hangarApi.checkRide, onSuccess: refresh }),
  };
}
