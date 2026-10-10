import type { AnchorResolver } from '../../speech/speech-anchors';
import { groundHeightAt } from '../physics/surface';
import type { PlayRuntime } from '../runtime/play-runtime';
import type { RemotePlayers } from './remote-players';

/** Above a street-scale avatar's head (where name tags sit), a car's roof and a danfo's. */
const WALK_HEAD = 2.25;
const CAR_TOP = 3.2;
const RIDE_TOP = 3.6;

/**
 * Speech bubbles outside: you over your avatar, car or ride; other players at their interpolated positions (avatars
 * near you, cars, or players too far to be drawn as avatars but still in your cells).
 */
export function outdoorAnchors(runtime: PlayRuntime, remotes: RemotePlayers): AnchorResolver {
  return (characterId, self, out) => {
    if (self) {
      const x = runtime.subjectX;
      const z = runtime.subjectZ;
      const onFoot = runtime.mode === 'walk' || (runtime.mode === 'ride' && runtime.ride.onFoot);
      out.set(x, groundHeightAt(x, z) + (onFoot ? WALK_HEAD : runtime.mode === 'ride' ? RIDE_TOP : CAR_TOP), z);
      return true;
    }
    const player = remotes.players.get(characterId);
    if (!player?.hasPose) return false;
    out.set(player.x, groundHeightAt(player.x, player.z) + (player.pose.mode === 'car' ? CAR_TOP : WALK_HEAD), player.z);
    return true;
  };
}
