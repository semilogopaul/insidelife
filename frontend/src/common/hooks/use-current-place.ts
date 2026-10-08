'use client';

import { useMemo } from 'react';
import { findVenue, homeLocationId, isHomeLocation, type VenueDefinition } from '@insidelife/shared';
import { segmentAt, useSnapshot } from '@/common/game/snapshot';
import { useGameMinute } from '@/common/game/use-game-clock';

export interface CurrentPlace {
  /** Raw location id (`venueId`, `home:<id>`, `street:<district>`), null before the snapshot loads. */
  readonly locationId: string | null;
  /** The catalog venue the character is inside, if any. */
  readonly venue: VenueDefinition | null;
  readonly atHome: boolean;
  readonly travelling: boolean;
  /** Label of a player-chosen action running right now ("Sleeping"), or null when free. */
  readonly busyWith: string | null;
}

/** Where the character is right now (from the snapshot — no extra request). Re-checks "busy" every 10 s. */
export function useCurrentPlace(): CurrentPlace {
  const { data: snapshot } = useSnapshot();
  const now = useGameMinute(10_000);
  return useMemo(() => {
    if (!snapshot) return { locationId: null, venue: null, atHome: false, travelling: false, busyWith: null };
    const locationId = snapshot.character.locationId;
    const segment = segmentAt(snapshot, now);
    const busy = segment !== undefined && segment.kind === 'action' && segment.explicit;
    return {
      locationId,
      venue: findVenue(locationId) ?? null,
      atHome: isHomeLocation(locationId) && locationId === homeLocationId(snapshot.character.id),
      travelling: snapshot.travel !== null,
      busyWith: busy ? segment.label : null,
    };
  }, [snapshot, now]);
}
