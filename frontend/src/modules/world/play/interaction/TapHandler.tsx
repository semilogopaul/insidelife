'use client';

import { isBillboardSlotId, type BillboardSlotId } from '@insidelife/shared';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Raycaster, Vector2, type Object3D } from 'three';
import { errorMessage } from '@/common/api/api-error';
import { toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useUi } from '@/common/game/ui-store';
import { currentBillboard, type CreativeContent } from '../../city/billboards/billboard-content';
import { useLiveBillboards } from '../../city/billboards/use-billboards';
import { promotionsApi } from '../flow/movement.api';
import { controls } from '../input/controls';
import type { RemotePlayers } from '../players/remote-players';
import type { PlayRuntime } from '../runtime/play-runtime';
import { usePlayUi } from '../state/play-ui-store';

const BILLBOARD_REACH = 90;
const PLAYER_REACH = 45;
const raycaster = new Raycaster();
const ndc = new Vector2();

/** Only plain web links leave the game. */
export function safeExternalUrl(url: string, base: string): URL | null {
  try {
    const parsed = new URL(url, base);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed : null;
  } catch {
    return null;
  }
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
        if (typeof object.userData.billboardSlotId === 'string') found.push(object);
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
      const hit = raycaster.intersectObjects(list, true)[0];
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
      const slotId = tagged(hit.object, 'billboardSlotId');
      if (slotId && isBillboardSlotId(slotId)) void openBillboard(slotId);
    }
  }, -3);

  return null;
}
