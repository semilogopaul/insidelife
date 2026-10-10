'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import {
  districtAt,
  homeEntrance,
  homeKey,
  homeLocationId,
  isStreetLocation,
  streetLocationId,
  venueEntrance,
  type CharacterSnapshotDto,
  type DistrictId,
  type Entrance,
  type SpawnPoint,
} from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { queryKeys } from '@/common/api/query-keys';
import { toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useSnapshot } from '@/common/game/snapshot';
import { useUi } from '@/common/game/ui-store';
import { useWorld, type Interactable } from '@/common/game/world-store';
import { useHomeView } from '../../interiors/walk/home-view-store';
import { isTypingTarget } from '../input/controls';
import { ensurePresenceDirectory } from '../players/presence-directory';
import { movementApi } from './movement.api';
import { spawnHandoff } from './spawn-handoff';
import { useRideArrival } from './use-ride-arrival';

/** Context-button id while inside a building. */
export const STEP_OUTSIDE_ID = 'world:step-outside';
const STEP_OUTSIDE: Interactable = { id: STEP_OUTSIDE_ID, kind: 'door', label: 'Step outside' };
/** Keys for the extra context options (the smaller buttons above the context button). */
const OPTION_KEYS: readonly string[] = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];

export type WorldPresence = 'outside' | 'inside' | 'riding';

function entranceOf(locationId: string, snapshot: CharacterSnapshotDto): Entrance | null {
  const { character } = snapshot;
  if (locationId === homeLocationId(character.id)) return homeEntrance(homeKey(character.id, character.homePropertyId), character.homeDistrictId as DistrictId);
  return venueEntrance(locationId);
}

/**
 * Always mounted with the world canvas (inside and outside). Owns the step-outside flow — `exit-building` from any
 * feature, the HUD context button while inside, the E key — and hands the spawn point to the play layer, and brings
 * a booked ride to its destination once the server has it there (`useRideArrival`). Also routes E to whatever the
 * context button shows and M to the phone's map.
 */
export function usePlayBridge(presence: WorldPresence): void {
  const client = useQueryClient();
  const { data: snapshot } = useSnapshot();
  const locationId = snapshot?.character.locationId ?? null;
  const lastInside = useRef<string | null>(null);
  const exiting = useRef(false);

  useEffect(() => {
    ensurePresenceDirectory();
  }, []);
  useRideArrival();

  useEffect(() => {
    if (locationId && !isStreetLocation(locationId)) lastInside.current = locationId;
  }, [locationId]);

  const exit = useCallback(async (): Promise<void> => {
    const current = client.getQueryData<CharacterSnapshotDto>(queryKeys.snapshot);
    if (!current || exiting.current) return;
    if (isStreetLocation(current.character.locationId)) {
      // Someone already stepped out without telling us where: rebuild the spawn from the door we came through.
      if (spawnHandoff.peek() || !lastInside.current) return;
      const entrance = entranceOf(lastInside.current, current);
      if (!entrance) return;
      const spawn: SpawnPoint = { locationId: streetLocationId(districtAt(entrance.position)), entrance, hasCar: false, car: null };
      spawnHandoff.offer(spawn, false);
      return;
    }
    if (current.travel) return;
    exiting.current = true;
    try {
      const { spawn, snapshot: next } = await movementApi.exit();
      spawnHandoff.offer(spawn, true);
      client.setQueryData(queryKeys.snapshot, next);
      gameEvents.emit('sfx', { id: 'door-open' });
    } catch (error) {
      gameEvents.emit('sfx', { id: 'ui-error' });
      toast({ title: 'Can’t step outside yet', body: errorMessage(error), tone: 'bad' });
    } finally {
      exiting.current = false;
    }
  }, [client]);

  useEffect(
    () =>
      gameEvents.on('exit-building', ({ spawn }) => {
        if (spawn) spawnHandoff.offer(spawn, true);
        else void exit();
      }),
    [exit],
  );

  // Inside: the HUD context button offers the hotspot you're standing at ("Drinks at the lounge · ₦18,000"; the
  // interiors start it), else steps outside.
  useEffect(() => {
    if (presence !== 'inside') return;
    const show = (offer: Interactable | null): void => useWorld.getState().setNearby(offer ?? STEP_OUTSIDE);
    show(useHomeView.getState().offer);
    const offOffer = useHomeView.subscribe((state, previous) => {
      if (state.offer !== previous.offer) show(state.offer);
    });
    const off = gameEvents.on('interact', ({ interactableId }) => {
      if (interactableId === STEP_OUTSIDE_ID) void exit();
    });
    return () => {
      off();
      offOffer();
      const nearby = useWorld.getState().nearby;
      if (nearby && (nearby.id === STEP_OUTSIDE_ID || nearby.kind === 'activity')) useWorld.getState().setNearby(null);
    };
  }, [presence, exit]);

  // E: the context action; 1–4: the other things to do at the same spot; M: the map.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      // With a thing's card open, its own keys choose (1–9, Esc).
      const option = useHomeView.getState().selected ? -1 : OPTION_KEYS.indexOf(event.code);
      if (event.code !== 'KeyE' && event.code !== 'KeyM' && option < 0) return;
      if (isTypingTarget(event.target) || useUi.getState().phoneOpen) return;
      if (event.code === 'KeyM') {
        gameEvents.emit('sfx', { id: 'ui-open' });
        useUi.getState().openPhone('map');
        return;
      }
      const nearby = useWorld.getState().nearby;
      const target = option >= 0 ? nearby?.more?.[option] : nearby;
      if (target) gameEvents.emit('interact', { interactableId: target.id });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
