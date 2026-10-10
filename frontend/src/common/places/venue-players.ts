'use client';

import { useQuery } from '@tanstack/react-query';
import type { PresencePlayerDto, VenuePlayerDto, VenuePlayersDto } from '@insidelife/shared';
import { api } from '@/common/api/http';
import { queryKeys } from '@/common/api/query-keys';

/** Who's at a venue (online first, then characters there on autopilot; blocks removed by the server). */
export const venuePlayersKey = (venueId: string) => queryKeys.domain('social', 'venue-players', venueId);

export const fetchVenuePlayers = (venueId: string) => api.get<VenuePlayersDto>(`/venues/${encodeURIComponent(venueId)}/players`);

/**
 * Shared by Gist → Here (the list, polled every 30 s while open) and the interior (the people drawn in the room:
 * fetched on entry and refreshed when someone not drawn yet speaks, `poll: false`, so being in a venue costs the API
 * nothing extra). One cache: while the Here tab polls, the room follows.
 */
export function useVenuePlayers(venueId: string | null, { poll = true }: { readonly poll?: boolean } = {}) {
  return useQuery({
    queryKey: venuePlayersKey(venueId ?? ''),
    queryFn: () => fetchVenuePlayers(venueId ?? ''),
    enabled: venueId !== null,
    staleTime: 15_000,
    refetchInterval: poll ? 30_000 : false,
  });
}

/** A player at a venue, drawn like any other player present. */
export function venuePlayerPresence(player: VenuePlayerDto, venueId: string): PresencePlayerDto {
  return {
    characterId: player.id,
    handle: player.handle,
    firstName: player.firstName,
    gender: player.gender,
    appearance: player.appearance,
    outfit: player.outfit,
    locationId: venueId,
    activity: player.activity,
    status: player.status,
  };
}
