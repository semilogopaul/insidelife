'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/common/api/query-keys';
import { useCurrentPlace } from '@/common/hooks/use-current-place';
import { stayApi } from '../services/stay.api';

const stayPrefix = queryKeys.domain('hotels');

/** Hotels, your stay and the reception you are standing at (keyed by where you stand: `here` depends on it). */
export function useHotels() {
  const { locationId } = useCurrentPlace();
  return useQuery({
    queryKey: queryKeys.domain('hotels', locationId ?? 'unknown'),
    queryFn: stayApi.overview,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

export function useStayCommands() {
  const client = useQueryClient();
  const refresh = (): void => {
    void client.invalidateQueries({ queryKey: stayPrefix });
    void client.invalidateQueries({ queryKey: queryKeys.snapshot });
  };
  return {
    book: useMutation({ mutationFn: (args: { venueId: string; nights: number }) => stayApi.book(args.venueId, args.nights), onSuccess: refresh }),
    checkout: useMutation({ mutationFn: () => stayApi.checkout(), onSuccess: refresh }),
  };
}
