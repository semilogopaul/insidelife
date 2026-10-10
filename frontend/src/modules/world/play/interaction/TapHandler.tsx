'use client';

import { findAdSlot, type BillboardSlotId } from '@insidelife/shared';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Box3, Matrix4, Ray, Raycaster, Vector2, Vector3, type Object3D } from 'three';
import { errorMessage } from '@/common/api/api-error';
import { toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useUi } from '@/common/game/ui-store';
import { currentBillboard, type CreativeContent } from '../../city/billboards/billboard-content';
import { useLiveBillboards } from '../../city/billboards/use-billboards';
import { safeExternalUrl } from '@/common/promotions/ad-tracking';
import { promotionsApi } from '../flow/movement.api';
import { controls } from '../input/controls';
import { yawFromHeading } from '../physics/math';
import type { OwnCar } from '../player/player-controller';
import type { RemotePlayers } from '../players/remote-players';
import type { PlayRuntime } from '../runtime/play-runtime';
import { usePlayUi } from '../state/play-ui-store';

const BILLBOARD_REACH = 90;
const PLAYER_REACH = 45;
/** Tapping your own car from up to this far walks you to its door and gets you in. */
export const CAR_TAP_REACH = 12;
/** The car's tap box is this much bigger than the body all round (fingers are fat). */
const CAR_TAP_MARGIN = 0.6;
const raycaster = new Raycaster();
const ndc = new Vector2();
const carInverse = new Matrix4();
const carRay = new Ray();
const carBox = new Box3();
const carHit = new Vector3();

/** Distance along `ray` to the player's own car (a generous box round its body), or null when it misses. */
export function carTapDistance(ray: Ray, car: Pick<OwnCar, 'state' | 'spec' | 'y'>): number | null {
  const { state, spec } = car;
  carInverse.makeRotationY(yawFromHeading(state.heading)).setPosition(state.x, car.y, state.z).invert();
  carRay.copy(ray).applyMatrix4(carInverse);
  carBox.min.set(-spec.halfWidth - CAR_TAP_MARGIN, 0, -spec.halfLength - CAR_TAP_MARGIN);
  carBox.max.set(spec.halfWidth + CAR_TAP_MARGIN, 2.2, spec.halfLength + CAR_TAP_MARGIN);
  return carRay.intersectBox(carBox, carHit) ? carHit.distanceTo(carRay.origin) : null;
}


function tagged(object: Object3D | null, key: 'billboardSlotId' | 'playerId'): string | null {
  let node: Object3D | null = object;
  while (node) {
    const value: unknown = node.userData[key];
    if (typeof value === 'string') return value;
    node = node.parent;
  }
  return null;
}

/**
 * Taps on the world (pointer releases without a drag, queued by the overlay): billboards open the sponsor sheet
 * (paid creative — the click is recorded first) or the phone's Promote app on that board (house ad); other players
 * become the context button's target.
 */
export function TapHandler({ runtime, remotes, online }: { readonly runtime: PlayRuntime; readonly remotes: RemotePlayers; readonly online: boolean }) {
  const scene = useThree((state) => state.scene);
  const { data: live } = useLiveBillboards();
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);
  const boards = useRef<Object3D[]>([]);
  const scanned = useRef(-10);
  const targets = useRef<Object3D[]>([]);

  const openBillboard = async (slotId: BillboardSlotId): Promise<void> => {
    const content = currentBillboard(slotId, liveRef.current, Date.now());
    gameEvents.emit('sfx', { id: 'ui-click' });
    if (content.kind === 'house') {
      useUi.getState().openPhone('promote', slotId);
      return;
    }
    const creative: CreativeContent = content;
    try {
      const target = online ? (await promotionsApi.click(creative.campaignId)).url : creative.linkUrl;
      const url = safeExternalUrl(target, window.location.origin);
      if (!url) throw new Error('unsafe');
      usePlayUi.getState().setSponsor({ title: creative.title, url: url.toString(), host: url.host });
    } catch (error) {
      toast({ title: 'That ad isn’t available', body: errorMessage(error), tone: 'neutral' });
    }
  };

  useFrame(({ camera, clock }) => {
    if (controls.taps.length === 0) return;
    // Billboard faces are static: rescan the scene every few seconds at most.
    if (clock.elapsedTime - scanned.current > 4) {
      scanned.current = clock.elapsedTime;
      const found: Object3D[] = [];
      scene.traverse((object) => {
        if (typeof object.userData.billboardSlotId === 'string' || Array.isArray(object.userData.billboardSlotIds)) found.push(object);
      });
      boards.current = found;
    }
    const list = targets.current;
    list.length = 0;
    for (const board of boards.current) list.push(board);
    for (const player of remotes.players.values()) {
      const object = player.avatar?.object;
      if (object?.visible && player.distance < PLAYER_REACH) list.push(object);
    }
    while (controls.taps.length > 0) {
      const tap = controls.taps.shift();
      if (!tap) break;
      ndc.set(tap.x, tap.y);
      raycaster.setFromCamera(ndc, camera);
      raycaster.far = BILLBOARD_REACH;
      // Where the tap landed (the wall it hit, or the ground): the door walk-in treats a tap at a door as pressing Enter.
      if (runtime.mode === 'walk') {
        const { origin, direction } = raycaster.ray;
        const wall = runtime.colliders.raycast(origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, 120);
        if (wall < 120) runtime.tapPoints.push({ x: origin.x + direction.x * wall, z: origin.z + direction.z * wall });
        if (direction.y < -0.02) {
          const t = -origin.y / direction.y;
          runtime.tapPoints.push({ x: origin.x + direction.x * t, z: origin.z + direction.z * t });
        }
        if (runtime.tapPoints.length > 6) runtime.tapPoints.splice(0, runtime.tapPoints.length - 6);
      }
      const hit = raycaster.intersectObjects(list, true)[0];
      // Your own parked car: tap it to get in (walking up to the door when it's a few steps away).
      const car = runtime.mode === 'walk' ? runtime.controller.car : null;
      const carDistance = car ? carTapDistance(raycaster.ray, car) : null;
      if (carDistance !== null && (!hit || carDistance <= hit.distance)) {
        if (runtime.controller.stepBesideCar(CAR_TAP_REACH)) gameEvents.emit('enter-car', {});
        else toast({ title: 'Walk up to your car first', tone: 'neutral' });
        continue;
      }
      if (!hit) continue;
      // Not through buildings.
      const ray = raycaster.ray;
      if (runtime.colliders.raycast(ray.origin.x, ray.origin.y, ray.origin.z, ray.direction.x, ray.direction.y, ray.direction.z, hit.distance) < hit.distance - 0.5) continue;
      const playerId = tagged(hit.object, 'playerId');
      if (playerId) {
        runtime.selectPlayer(playerId);
        gameEvents.emit('sfx', { id: 'ui-click' });
        continue;
      }
      // Instanced "Your ad here" faces map their instance to a slot.
      const ids: unknown = hit.object.userData.billboardSlotIds;
      const slotId = tagged(hit.object, 'billboardSlotId') ?? (Array.isArray(ids) && hit.instanceId !== undefined ? (ids[hit.instanceId] as string | undefined) ?? null : null);
      if (slotId && findAdSlot(slotId)) void openBillboard(slotId);
    }
  }, -3);

  return null;
}
