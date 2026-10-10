'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import type { PresencePlayerDto, VenuePlayerDto } from '@insidelife/shared';
import { useVenuePlayers, venuePlayerPresence, venuePlayersKey } from '@/common/places';
import { useSpeech } from '@/common/speech';

const NONE: readonly PresencePlayerDto[] = [];
/** Someone you can't see spoke: refresh who's here, at most this often. */
const REFRESH_GAP_MS = 5_000;

/** Online players first, then characters on autopilot; each group by id so people keep their spots between polls. */
export function guestOrder(players: readonly VenuePlayerDto[]): VenuePlayerDto[] {
  const byId = (a: VenuePlayerDto, b: VenuePlayerDto): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return [...players.filter((player) => player.online).toSorted(byId), ...players.filter((player) => !player.online).toSorted(byId)];
}

/**
 * The other people at the venue you're in, to draw at the room's guest spots (the same list as Gist → Here). When
 * someone who isn't drawn yet says something, the list refreshes so their bubble gets a body.
 */
export function useVenueGuests(venueId: string | null): readonly PresencePlayerDto[] {
  const client = useQueryClient();
  const { data } = useVenuePlayers(venueId, { poll: false });
  const guests = useMemo(() => (venueId && data ? guestOrder(data.players).map((player) => venuePlayerPresence(player, venueId)) : NONE), [venueId, data]);
  const lastRefresh = useRef(0);
  const known = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    known.current = new Set(guests.map((guest) => guest.characterId));
  }, [guests]);

  useEffect(() => {
    if (!venueId) return;
    return useSpeech.subscribe((state, previous) => {
      const line = state.lines[state.lines.length - 1];
      if (!line || line === previous.lines[previous.lines.length - 1] || line.mine) return;
      if (line.scope !== 'place' || line.locationId !== venueId || known.current.has(line.characterId)) return;
      const now = Date.now();
      if (now - lastRefresh.current < REFRESH_GAP_MS) return;
      lastRefresh.current = now;
      void client.invalidateQueries({ queryKey: venuePlayersKey(venueId) });
    });
  }, [venueId, client]);

  return guests;
}
