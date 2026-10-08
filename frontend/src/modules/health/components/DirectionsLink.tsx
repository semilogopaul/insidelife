'use client';

import { Navigation } from 'lucide-react';
import { toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useNavigation } from '@/common/game/navigation-store';
import { useUi } from '@/common/game/ui-store';

/** Compact "Directions to …" for a list row: sets the GPS and closes the phone. */
export function DirectionsLink({
  venueId,
  venueName,
}: {
  readonly venueId: string;
  readonly venueName: string;
}) {
  const setDestination = useNavigation((state) => state.setDestination);
  const closePhone = useUi((state) => state.closePhone);
  return (
    <button
      type="button"
      onClick={() => {
        setDestination(venueId, venueName);
        gameEvents.emit('sfx', { id: 'ui-success' });
        toast({ title: `GPS set: ${venueName}`, body: 'Follow the route on your minimap.', tone: 'neutral' });
        closePhone();
      }}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-chip px-2 text-sm font-bold text-cobalt hover:bg-cobalt-soft"
    >
      <Navigation size={15} aria-hidden />
      Directions to {venueName}
    </button>
  );
}
