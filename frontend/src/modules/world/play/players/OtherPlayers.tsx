'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Vector3 } from 'three';
import { decodeWorldBatch } from '@insidelife/shared';
import { gameClock } from '@/common/game/game-clock';
import { useRealtimeEvent } from '@/common/realtime/use-realtime';
import { Avatar, npcLook, type AvatarHandle } from '@/common/three/avatar';
import { ROAD_Y } from '../../city/layout/placements';
import type { BlobShadows } from '../effects/blob-shadows';
import { clamp, yawFromHeading } from '../physics/math';
import { groundHeightAt } from '../physics/surface';
import { PLAYER_SCALE, gaitFor, type PlayRuntime } from '../runtime/play-runtime';
import { tagElements, usePlayUi, type RemoteTag } from '../state/play-ui-store';
import { REMOTE_CAR_SLOTS } from '../traffic/TrafficLayer';
import { isDrivableModel } from '../vehicles/vehicle-kit';
import { handleOf, presenceOf, subscribePresence } from './presence-directory';
import type { RemotePlayers } from './remote-players';

const AVATAR_RANGE = 70;
const TAG_RANGE = 45;
const MAX_TAGS = 8;
const projected = new Vector3();

let presenceVersion = 0;
const presenceSubscribe = (listener: () => void): (() => void) =>
  subscribePresence(() => {
    presenceVersion++;
    listener();
  });
const presenceSnapshot = (): number => presenceVersion;

/** A car's paint as a batch tint: blended halfway to white so windows and tyres don't go dark. */
function paintTint(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const blend = (channel: number): number => Math.round((channel + 255) / 2);
  return (blend((value >> 16) & 0xff) << 16) | (blend((value >> 8) & 0xff) << 8) | blend(value & 0xff);
}

/** Feeds `world:players` into the remote registry (online sessions only). */
export function RemoteFeed({ remotes }: { readonly remotes: RemotePlayers }) {
  useRealtimeEvent('world:players', (batch) => remotes.ingest(decodeWorldBatch(batch), performance.now()));
  return null;
}

function RemoteAvatar({ remotes, id, blobSlot }: { readonly remotes: RemotePlayers; readonly id: string; readonly blobSlot: number }) {
  useSyncExternalStore(presenceSubscribe, presenceSnapshot, presenceSnapshot);
  const presence = presenceOf(id);
  const fallback = useMemo(() => npcLook(id, 'casual'), [id]);
  const register = useCallback(
    (handle: AvatarHandle | null) => {
      const player = remotes.players.get(id);
      if (player) {
        player.avatar = handle;
        player.clip = 'idle';
      }
      if (handle?.object) {
        handle.object.userData.playerId = id;
        handle.object.userData.blobSlot = blobSlot;
      }
    },
    [remotes, id, blobSlot],
  );
  return (
    <Avatar
      ref={register}
      appearance={presence?.appearance ?? fallback.appearance}
      outfit={presence?.outfit ?? fallback.outfit}
      clothing={presence ? undefined : fallback.clothing}
      gender={presence?.gender ?? fallback.gender}
      lod="low"
      deferBuild
      shadow={false}
      props={false}
      scale={PLAYER_SCALE}
      animation="idle"
    />
  );
}

/**
 * Other players near you: avatars on foot (nearest few), cars in the shared vehicle batch, name tags (DOM, positioned
 * per frame), interpolated ~150 ms behind the server.
 */
export function OtherPlayers({ runtime, remotes, maxAvatars, blobs, blobBase }: { readonly runtime: PlayRuntime; readonly remotes: RemotePlayers; readonly maxAvatars: number; readonly blobs: BlobShadows | null; readonly blobBase: number }) {
  const [walkers, setWalkers] = useState<readonly string[]>([]);
  const size = useThree((state) => state.size);

  // Low rate: who to render as avatars, and which name tags to show.
  useEffect(() => {
    const id = window.setInterval(() => {
      const nextWalkers = remotes.nearest(maxAvatars, AVATAR_RANGE, 'walk');
      setWalkers((current) => (current.length === nextWalkers.length && current.every((value, i) => value === nextWalkers[i]) ? current : nextWalkers));
      const tags: RemoteTag[] = remotes.nearest(MAX_TAGS, TAG_RANGE + 10).map((playerId) => ({ id: playerId, handle: handleOf(playerId) }));
      const ui = usePlayUi.getState();
      const same = ui.tags.length === tags.length && ui.tags.every((tag, i) => tag.id === tags[i]?.id && tag.handle === tags[i]?.handle);
      if (!same) ui.setTags(tags);
    }, 500);
    return () => {
      window.clearInterval(id);
      usePlayUi.getState().setTags([]);
    };
  }, [remotes, maxAvatars]);

  useFrame(({ camera }) => {
    remotes.update(gameClock.serverNow(), performance.now(), runtime.subjectX, runtime.subjectZ);
    const batch = runtime.vehicleBatch;
    const carBase = runtime.traffic.cars.length;
    let carSlot = 0;
    let blob = 0;
    for (const player of remotes.players.values()) {
      if (!player.hasPose) continue;
      const driving = player.pose.mode === 'car';
      if (driving) {
        if (batch && carSlot < REMOTE_CAR_SLOTS && player.distance < 260) {
          const look = player.vehicle;
          const model = look && isDrivableModel(look.model) ? look.model : 'sedan';
          batch.set(carBase + carSlot++, model, player.x, ROAD_Y, player.z, player.heading, look ? paintTint(look.color) : 0xffffff);
        }
        if (player.avatar?.object) player.avatar.object.visible = false;
        continue;
      }
      const avatar = player.avatar;
      const object = avatar?.object;
      if (!avatar || !object) continue;
      object.visible = true;
      const y = groundHeightAt(player.x, player.z);
      object.position.set(player.x, y, player.z);
      object.rotation.y = yawFromHeading(player.heading);
      const gait = gaitFor(player.pose.speed, PLAYER_SCALE);
      if (gait.clip !== player.clip) {
        player.clip = gait.clip;
        avatar.play(gait.clip, { fade: 0.25 });
      }
      avatar.setTimeScale(gait.timeScale);
      if (blobs && blob < 12) blobs.set(blobBase + blob++, player.x, y, player.z, 0.95);
    }
    if (batch) for (let i = carSlot; i < REMOTE_CAR_SLOTS; i++) batch.hide(carBase + i);
    if (blobs) for (let i = blob; i < 12; i++) blobs.hide(blobBase + i);

    // Name tags.
    for (const [id, element] of tagElements) {
      const player = remotes.players.get(id);
      if (!player || !player.hasPose || player.distance > TAG_RANGE) {
        element.style.opacity = '0';
        continue;
      }
      const height = player.pose.mode === 'car' ? 3.2 : 2.25;
      projected.set(player.x, groundHeightAt(player.x, player.z) + height, player.z).project(camera);
      if (projected.z > 1 || projected.x < -1.2 || projected.x > 1.2 || projected.y < -1.2 || projected.y > 1.2) {
        element.style.opacity = '0';
        continue;
      }
      const sx = (projected.x * 0.5 + 0.5) * size.width;
      const sy = (-projected.y * 0.5 + 0.5) * size.height;
      element.style.transform = `translate(-50%, -100%) translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
      // Behind a building: keep the tag faint so you know someone's there without it floating through walls.
      const tx = player.x - camera.position.x;
      const ty = groundHeightAt(player.x, player.z) + height - camera.position.y;
      const tz = player.z - camera.position.z;
      const reach = Math.hypot(tx, ty, tz);
      const hidden = reach > 0.1 && runtime.colliders.raycast(camera.position.x, camera.position.y, camera.position.z, tx / reach, ty / reach, tz / reach, reach) < reach - 0.5;
      element.style.opacity = String((clamp(1.4 - player.distance / TAG_RANGE, 0, 1) * (hidden ? 0.3 : 1)).toFixed(2));
    }
  }, -3);

  return (
    <>
      {walkers.map((id, i) => (
        <RemoteAvatar key={id} remotes={remotes} id={id} blobSlot={blobBase + i} />
      ))}
    </>
  );
}
