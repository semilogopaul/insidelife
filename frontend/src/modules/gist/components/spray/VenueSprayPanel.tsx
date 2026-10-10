'use client';

import { useState } from 'react';
import { sprayNightIndex, type VenueDefinition, type VenuePlayerDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { toast } from '@/common/components';
import { gameClock } from '@/common/game/game-clock';
import { gameEvents } from '@/common/game/game-events';
import { useGameMinute } from '@/common/game/use-game-clock';
import { newIdempotencyKey } from '@/common/utils/money-input';
import { useVenueSpray } from '../../hooks/use-social';
import { DJ_TARGET, SprayPad, type SprayTarget } from './SprayPad';

export interface VenueSprayPanelProps {
  readonly venue: VenueDefinition;
  readonly players: readonly VenuePlayerDto[];
  readonly cash: number;
}

/** Spraying at a club or bar, no party needed: anyone in the room, or the DJ. Everyone inside sees the money rain. */
export function VenueSprayPanel({ venue, players, cash }: VenueSprayPanelProps) {
  const targets: readonly SprayTarget[] = [
    ...players.map((player) => ({ handle: player.handle, firstName: player.firstName, lastName: player.lastName, tag: player.isFriend ? 'friend' : undefined })),
    DJ_TARGET,
  ];
  // The server keeps the night's total; until the first spray of this visit we only know it from the replies. A night
  // runs 6 AM to 6 AM: once the next one starts, last night's total no longer counts (nor shows).
  const [sprayed, setSprayed] = useState<{ readonly night: number; readonly total: number } | null>(null);
  const night = sprayNightIndex(useGameMinute(5000));
  const tonight = sprayed && sprayed.night === night ? sprayed.total : 0;
  const spray = useVenueSpray(venue.id);

  const send = (toHandle: string | null, amount: number): void => {
    spray.mutate(
      { toHandle, amount, idempotencyKey: newIdempotencyKey() },
      {
        onSuccess: (result) => {
          setSprayed({ night: sprayNightIndex(gameClock.now()), total: result.yourNightTotal });
          if (result.cloutGained > 0) toast({ title: `+${result.cloutGained} clout`, body: result.to ? 'The DJ gave you a shout-out.' : 'The DJ dropped your name on the mic.', tone: 'good' });
          if (result.nairaAbuse) gameEvents.emit('sfx', { id: 'ui-error' });
        },
        onError: (error) => {
          gameEvents.emit('sfx', { id: 'ui-error' });
          toast({ title: 'The notes didn’t land', body: errorMessage(error), tone: 'bad' });
        },
      },
    );
  };

  return (
    <SprayPad
      targets={targets}
      cash={cash}
      total={tonight}
      where={`at ${venue.name} tonight`}
      heading="Spray who?"
      empty="Nobody to spray yet."
      onSpray={send}
    />
  );
}
