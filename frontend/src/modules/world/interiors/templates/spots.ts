import type { AvatarClip } from '@/common/three/avatar';
import type { PlayerSpots, Spot } from './types';

/** Fallback chain per animation: the most specific authored spot first, then related ones, then `default`. */
const FALLBACKS: Readonly<Partial<Record<AvatarClip, readonly AvatarClip[]>>> = {
  eat: ['sit'],
  read: ['sit', 'type'],
  type: ['sit', 'read'],
  phone: ['sit', 'idle'],
  talk: ['idle', 'sit'],
  drive: ['sit'],
  wave: ['idle'],
  cheer: ['dance', 'idle'],
  dance: ['idle'],
  exercise: ['idle'],
  pray: ['idle'],
  cook: ['idle'],
  shower: ['idle'],
  sleep: ['sit'],
  walk: ['idle'],
  jog: ['walk', 'idle'],
  run: ['walk', 'idle'],
};

/** Where the player goes for an animation. Pure. */
export function pickPlayerSpot(spots: PlayerSpots, animation: AvatarClip): Spot {
  const direct = spots[animation];
  if (direct) return direct;
  for (const fallback of FALLBACKS[animation] ?? []) {
    const spot = spots[fallback];
    // A bed is only for sleeping; don't sit on it for other things unless it's authored that way.
    if (spot) return spot;
  }
  return spots.default ?? { at: [0, 0], animation: 'idle' };
}

/** Avatar position/rotation props for a spot. */
export function placeAt(spot: Spot): { readonly position: readonly [number, number, number]; readonly rotationY: number } {
  const position: readonly [number, number, number] = spot.at.length === 3 ? [spot.at[0], spot.at[1], spot.at[2]] : [spot.at[0], 0, spot.at[1]];
  return { position, rotationY: ((spot.rot ?? 0) * Math.PI) / 180 };
}
