import type { WorldPlayerPositionDto, WorldVehicleLook } from '@insidelife/shared';
import type { AvatarClip, AvatarHandle } from '@/common/three/avatar';
import { InterpolationBuffer, type RemotePose } from './interpolation';
import { rememberHandle } from './presence-directory';

/**
 * Other players in the open world: an interpolation buffer per character fed by `world:players`, sampled each frame
 * ~150 ms behind the server clock. Players silent for a while are dropped. Rendering picks the nearest few as
 * avatars (walking) or batched cars (driving). No React state; the visible set is published at a low rate.
 */

export interface RemotePlayer {
  readonly id: string;
  readonly buffer: InterpolationBuffer;
  readonly pose: RemotePose;
  /** Local time (ms) of the last sample. */
  lastHeard: number;
  /** Smoothed render position (the interpolated pose, eased to hide jitter). */
  x: number;
  z: number;
  heading: number;
  hasPose: boolean;
  /** Registered avatar (when rendered on foot). */
  avatar: AvatarHandle | null;
  clip: AvatarClip;
  /** Distance to the local player last frame. */
  distance: number;
  /** The car they drive (latest position that carried one). */
  vehicle: WorldVehicleLook | null;
}

const FORGET_AFTER_MS = 12_000;

export class RemotePlayers {
  readonly players = new Map<string, RemotePlayer>();
  selfId: string | null = null;

  setSelf(id: string | null): void {
    this.selfId = id;
    if (id) this.players.delete(id);
  }

  ingest(positions: readonly WorldPlayerPositionDto[], localNow: number): void {
    for (const position of positions) {
      if (position.characterId === this.selfId) continue;
      if (![position.x, position.z, position.heading, position.speed, position.t].every(Number.isFinite)) continue;
      let player = this.players.get(position.characterId);
      if (!player) {
        player = {
          id: position.characterId,
          buffer: new InterpolationBuffer(),
          pose: { x: position.x, z: position.z, heading: position.heading, speed: 0, mode: position.mode },
          lastHeard: localNow,
          x: position.x,
          z: position.z,
          heading: position.heading,
          hasPose: false,
          avatar: null,
          clip: 'idle',
          distance: Number.POSITIVE_INFINITY,
          vehicle: null,
        };
        this.players.set(position.characterId, player);
      }
      player.buffer.push(position.t, position.x, position.z, position.heading, position.speed, position.mode);
      player.lastHeard = localNow;
      if (position.vehicle) player.vehicle = position.vehicle;
      if (position.handle) rememberHandle(position.characterId, position.handle);
    }
  }

  /** Advance every player to `serverNow`; drop silent ones. */
  update(serverNow: number, localNow: number, fromX: number, fromZ: number): void {
    for (const [id, player] of this.players) {
      if (localNow - player.lastHeard > FORGET_AFTER_MS) {
        this.players.delete(id);
        continue;
      }
      if (!player.buffer.sample(serverNow, player.pose)) continue;
      if (!player.hasPose || Math.hypot(player.pose.x - player.x, player.pose.z - player.z) > 25) {
        player.x = player.pose.x;
        player.z = player.pose.z;
        player.heading = player.pose.heading;
        player.hasPose = true;
      } else {
        player.x += (player.pose.x - player.x) * 0.5;
        player.z += (player.pose.z - player.z) * 0.5;
        player.heading = player.pose.heading;
      }
      player.distance = Math.hypot(player.x - fromX, player.z - fromZ);
    }
  }

  /** Ids of the nearest players within `radius`, nearest first (at most `limit`). */
  nearest(limit: number, radius: number, mode?: 'walk' | 'car'): string[] {
    const list: RemotePlayer[] = [];
    for (const player of this.players.values()) {
      if (!player.hasPose || player.distance > radius) continue;
      if (mode && player.pose.mode !== mode) continue;
      list.push(player);
    }
    list.sort((a, b) => a.distance - b.distance);
    return list.slice(0, limit).map((player) => player.id);
  }
}
