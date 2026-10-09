'use client';

import { useState } from 'react';
import type { PartyDetailDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { newIdempotencyKey } from '@/common/utils/money-input';
import { useSpray } from '../../hooks/use-parties';
import { SprayPad, type SprayTarget } from '../spray/SprayPad';

export interface SprayPanelProps {
  readonly party: PartyDetailDto;
  readonly me: { readonly id: string; readonly handle: string };
  /** Cash in hand (sprays come out of your cash). */
  readonly cash: number;
}

/** Spraying at an owambe: the host and guests. Every tap is one spray with its own idempotency key. */
export function SprayPanel({ party, me, cash }: SprayPanelProps) {
  const targets: readonly SprayTarget[] = [party.host, ...party.guests]
    .filter((player, index, all) => player.id !== me.id && all.findIndex((other) => other.id === player.id) === index)
    .map((player) => ({ handle: player.handle, firstName: player.firstName, lastName: player.lastName, tag: player.id === party.host.id ? 'host' : undefined }));
  const [myTotal, setMyTotal] = useState<number>(() => party.topSprayers.find((entry) => entry.player.id === me.id)?.amount ?? 0);
  const spray = useSpray(party.id);

  const send = (toHandle: string | null, amount: number): void => {
    if (!toHandle) return;
    spray.mutate(
      { toHandle, amount, idempotencyKey: newIdempotencyKey() },
      {
        onSuccess: (result) => {
          setMyTotal(result.yourPartyTotal);
          if (result.cloutGained > 0) toast({ title: `+${result.cloutGained} clout`, body: 'The MC just hailed you.', tone: 'good' });
          // EFCC fines arrive as a server notification (toasted by the game root); just make it sting.
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
      total={myTotal}
      where="at this party"
      heading="Who’s dancing?"
      empty="Nobody else is here to spray yet. Wait for the dance floor to fill up."
      onSpray={send}
    />
  );
}
