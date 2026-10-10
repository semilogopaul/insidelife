'use client';

import { useQuery } from '@tanstack/react-query';
import type { TransportMode } from '@insidelife/shared';
import { api } from '@/common/api/http';
import { queryKeys } from '@/common/api/query-keys';

/** One way to get somewhere right now (`GET /characters/me/travel/quotes`). */
export interface TravelQuote {
  readonly mode: TransportMode;
  readonly label: string;
  readonly minutes: number;
  readonly fare: number;
  readonly available: boolean;
  readonly reason?: string;
  /** The place will be shut when this ride gets you there: the hour it opens (booking it needs a confirm). */
  readonly closedOnArrival?: number;
}

/**
 * Every mode's time and fare to a venue or home right now. Shared by features that offer "take me there" (the Map app
 * books rides with the same quotes); `car` says whether the player has a car to drive.
 */
export function useTravelQuotes(destinationId: string | null) {
  return useQuery({
    queryKey: queryKeys.domain('travel', 'quotes', destinationId ?? ''),
    queryFn: () => api.get<TravelQuote[]>('/characters/me/travel/quotes', { query: { destinationId: destinationId ?? '' } }),
    enabled: destinationId !== null,
    staleTime: 15_000,
  });
}
