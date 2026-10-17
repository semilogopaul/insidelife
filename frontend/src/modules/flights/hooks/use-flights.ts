'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CityId, FlightCabin, FlightChannel, TravelActionResultDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { queryKeys } from '@/common/api/query-keys';
import { toast } from '@/common/components';
import { useWriteSnapshot } from '@/common/game/snapshot';
import { flightsApi } from '../services/flights.api';

export const flightsKeys = {
  overview: queryKeys.domain('flights', 'overview'),
  search: (from: CityId, day: number) => queryKeys.domain('flights', 'search', from, day),
  searchAll: queryKeys.domain('flights', 'search'),
} as const;

export function useFlightsOverview() {
  return useQuery({ queryKey: flightsKeys.overview, queryFn: flightsApi.overview, staleTime: 10_000, refetchInterval: 30_000 });
}

export function useFlightSearch(from: CityId | undefined, day: number) {
  return useQuery({
    queryKey: flightsKeys.search(from ?? 'lagos', day),
    queryFn: () => flightsApi.search(from ?? 'lagos', day),
    enabled: from !== undefined,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

export type FlightAction =
  | { readonly kind: 'book'; readonly flightId: string; readonly cabin: FlightCabin; readonly channel: FlightChannel }
  | { readonly kind: 'check-in'; readonly bookingId: string }
  | { readonly kind: 'board'; readonly bookingId: string }
  | { readonly kind: 'change'; readonly bookingId: string; readonly flightId: string }
  | { readonly kind: 'bus'; readonly toCity: CityId };

function send(action: FlightAction): Promise<TravelActionResultDto> {
  switch (action.kind) {
    case 'book':
      return flightsApi.book(action.flightId, action.cabin, action.channel);
    case 'check-in':
      return flightsApi.checkIn(action.bookingId);
    case 'board':
      return flightsApi.board(action.bookingId);
    case 'change':
      return flightsApi.change(action.bookingId, action.flightId);
    case 'bus':
      return flightsApi.bus(action.toCity);
  }
}

const DONE: Readonly<Record<FlightAction['kind'], string>> = {
  book: 'Ticket booked',
  'check-in': 'Checked in',
  board: 'Boarding',
  change: 'Flight changed',
  bus: 'Coach booked',
};

/** Every flights action answers with the new overview and snapshot: both go straight into the cache. */
export function useFlightAction() {
  const client = useQueryClient();
  const writeSnapshot = useWriteSnapshot();
  return useMutation({
    mutationFn: send,
    onSuccess: async (result, action) => {
      client.setQueryData(flightsKeys.overview, result.overview);
      await writeSnapshot(result.snapshot);
      void client.invalidateQueries({ queryKey: flightsKeys.searchAll });
      toast({ title: DONE[action.kind], tone: 'good' });
    },
    onError: (error) => toast({ title: 'Could not do that', body: errorMessage(error), tone: 'bad' }),
  });
}
