'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CharacterSnapshotDto, GatId, HangarDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { queryKeys } from '@/common/api/query-keys';
import { toast } from '@/common/components';
import { useWriteSnapshot } from '@/common/game/snapshot';
import { useCurrentPlace } from '@/common/hooks/use-current-place';
import { useAboard } from './aboard-store';
import { aviationApi } from './aviation-api';

/** The Hangar phone app caches the same endpoint under the same keys, so both read one cache. */
const hangarPrefix = queryKeys.domain('hangar');
const flightsOverviewKey = queryKeys.domain('flights', 'overview');

/** Your fleet, catalogue and licence (keyed by where you stand: `atGat` and the fly blockers depend on it). */
export function useOwnFleet(enabled = true) {
  const { locationId } = useCurrentPlace();
  return useQuery({
    queryKey: queryKeys.domain('hangar', locationId ?? 'unknown'),
    queryFn: aviationApi.hangar,
    placeholderData: keepPreviousData,
    enabled,
    staleTime: 15_000,
  });
}

/** Other players' planes parked at a terminal: friends' and those of players there, six at most; the rest are hangared. */
export function useApron(gat: GatId | null) {
  return useQuery({
    queryKey: queryKeys.domain('aviation', 'apron', gat ?? ''),
    queryFn: () => aviationApi.apron(gat ?? ''),
    enabled: gat !== null,
    staleTime: 20_000,
    refetchInterval: 45_000,
  });
}

/** Fly the plane you are sitting in. The snapshot is refetched at once: it now carries the flight. */
export function useFlyAircraft() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { readonly aircraftId: string; readonly destination: GatId }) => aviationApi.fly(args.aircraftId, { destination: args.destination }),
    onSuccess: async (result) => {
      // The plane is airborne now: show it at once so the cabin and the sky know which flight this is.
      client.setQueriesData<HangarDto>({ queryKey: hangarPrefix }, (old) => (old ? { ...old, mine: old.mine.map((plane) => (plane.id === result.aircraft.id ? result.aircraft : plane)) } : old));
      await client.invalidateQueries({ queryKey: queryKeys.snapshot });
      void client.invalidateQueries({ queryKey: hangarPrefix });
    },
    onError: (error) => toast({ title: 'Can’t take off', body: errorMessage(error), tone: 'bad' }),
  });
}

/**
 * Step aboard, or out of, your own parked aircraft. The server owns the location (`aircraft:<id>` aboard: the cabin
 * with your decor, and the Hangar's "Decorate cabin"); the cabin responds at once through the `useAboard` mirror and the
 * snapshot is patched when the server answers.
 */
export function useAircraftBoarding() {
  const client = useQueryClient();
  const patchLocation = (locationId: string): void => {
    client.setQueryData<CharacterSnapshotDto>(queryKeys.snapshot, (old) => (old ? { ...old, character: { ...old.character, locationId } } : old));
  };
  const board = useMutation({
    mutationFn: (aircraftId: string) => aviationApi.boardAircraft(aircraftId),
    onMutate: (aircraftId) => useAboard.getState().board(aircraftId),
    onSuccess: (result) => {
      patchLocation(result.locationId);
      void client.invalidateQueries({ queryKey: queryKeys.snapshot });
    },
    onError: (error) => {
      useAboard.getState().reset();
      toast({ title: 'Can’t board', body: errorMessage(error), tone: 'bad' });
    },
    onSettled: () => useAboard.getState().settled(),
  });
  const deplane = useMutation({
    mutationFn: (aircraftId: string) => aviationApi.deplaneAircraft(aircraftId),
    onMutate: () => useAboard.getState().deplane(),
    onSuccess: (result) => {
      patchLocation(result.locationId);
      void client.invalidateQueries({ queryKey: queryKeys.snapshot });
    },
    onError: (error, aircraftId) => {
      useAboard.setState({ aircraftId, returnToAirside: false });
      toast({ title: 'Can’t step out', body: errorMessage(error), tone: 'bad' });
    },
    onSettled: () => useAboard.getState().settled(),
  });
  return {
    // `mutate` is stable between renders, so these are safe in effect and callback dependencies.
    board: board.mutate as (aircraftId: string) => void,
    deplane: deplane.mutate as (aircraftId: string) => void,
    pending: board.isPending || deplane.isPending,
  };
}

/** The commercial flights overview (shared with the Flights app): bookings, check-in and gate state. */
export function useFlightsState(enabled = true) {
  return useQuery({
    queryKey: flightsOverviewKey,
    queryFn: aviationApi.flights,
    enabled,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

/** Check in or board a booked flight from the terminal. Both answer with the new overview and snapshot. */
export function useGateAction() {
  const client = useQueryClient();
  const writeSnapshot = useWriteSnapshot();
  return useMutation({
    mutationFn: (action: { readonly kind: 'check-in' | 'board'; readonly bookingId: string }) =>
      action.kind === 'check-in' ? aviationApi.checkIn(action.bookingId) : aviationApi.board(action.bookingId),
    onSuccess: async (result, action) => {
      client.setQueryData(flightsOverviewKey, result.overview);
      await writeSnapshot(result.snapshot);
      toast({ title: action.kind === 'check-in' ? 'Checked in' : 'Boarding', tone: 'good' });
    },
    onError: (error) => toast({ title: 'Could not do that', body: errorMessage(error), tone: 'bad' }),
  });
}

/** The others on the commercial flight you are aboard (drawn in the cabin). Fetched once per flight. */
export function useFlightPassengers(flightId: string | null) {
  return useQuery({
    queryKey: queryKeys.domain('aviation', 'passengers', flightId ?? ''),
    queryFn: () => aviationApi.passengers(flightId ?? ''),
    enabled: flightId !== null,
    staleTime: 60_000,
  });
}
