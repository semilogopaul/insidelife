'use client';

import { venueEntrance } from '@insidelife/shared';
import { gameEvents } from '@/common/game/game-events';
import { useRealtimeEvent } from '@/common/realtime/use-realtime';
import { characterIdByHandle } from '../players/presence-directory';
import type { RemotePlayers } from '../players/remote-players';
import type { PlayRuntime } from '../runtime/play-runtime';
import type { MoneyBurstHandle } from './MoneyBurst';

const NEAR = 60;

/**
 * `party:spray` → a naira-note burst over the sprayer and the recipient when they're near you in the street (yourself
 * included), or over the party venue's door when you're passing outside.
 */
export function SprayListener({ runtime, remotes, burst, selfHandle, reducedMotion }: { readonly runtime: PlayRuntime; readonly remotes: RemotePlayers; readonly burst: MoneyBurstHandle; readonly selfHandle: string | null; readonly reducedMotion: boolean }) {
  useRealtimeEvent('party:spray', (spray) => {
    const count = reducedMotion ? 10 : spray.amount >= 100_000 ? 40 : 26;
    let shown = false;
    const near = (x: number, z: number): boolean => Math.hypot(x - runtime.subjectX, z - runtime.subjectZ) <= NEAR;
    for (const handle of [spray.fromHandle, spray.toHandle]) {
      if (selfHandle && handle.toLowerCase() === selfHandle.toLowerCase() && runtime.mode !== 'ride') {
        burst.trigger(runtime.subjectX, runtime.controller.y + 2.4, runtime.subjectZ, count);
        shown = true;
        continue;
      }
      const id = characterIdByHandle(handle);
      const player = id ? remotes.players.get(id) : undefined;
      if (player?.hasPose && near(player.x, player.z)) {
        burst.trigger(player.x, 2.4, player.z, count);
        shown = true;
      }
    }
    if (!shown) {
      const door = venueEntrance(spray.venueId);
      if (door && near(door.position.x, door.position.z)) {
        burst.trigger(door.position.x, 3, door.position.z, count);
        shown = true;
      }
    }
    if (shown) gameEvents.emit('sfx', { id: 'spray' });
  });
  return null;
}
