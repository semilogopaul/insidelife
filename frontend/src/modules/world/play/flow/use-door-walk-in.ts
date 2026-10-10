'use client';

import { useEffect, useRef } from 'react';
import { ENTRY_RADIUS } from '@insidelife/shared';
import { gameEvents } from '@/common/game/game-events';
import { WALK_IN_RADIUS, WalkInGate, isHeadingToward } from '@/common/game/walk-in';
import type { PlayRuntime } from '../runtime/play-runtime';
import { nearestDoor, type Door } from './doors';
import { doorId } from './use-world-sync';

const TICK_MS = 100;
const DT = TICK_MS / 1000;
/** A tap on a door or the building front within this many metres of the entrance counts as tapping the door. */
export const DOOR_TAP_RADIUS = 3.5;

export interface DoorWalkInOptions {
  readonly homeDoor: Door | null;
  readonly visitDoors: readonly Door[];
}

/**
 * On foot in the street: pushing into a home's or venue's door for a moment, or tapping the door/building front, does
 * what the Enter button does (the same `interact`, so closed hours or a locked home show the same message). A door
 * you spawn beside or just used stays inert until you step away from it.
 */
export function useDoorWalkIn(runtime: PlayRuntime, options: DoorWalkInOptions): void {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    const gate = new WalkInGate();
    const timer = window.setInterval(() => {
      const { homeDoor, visitDoors } = optionsRef.current;
      const privateDoors = homeDoor ? [homeDoor, ...visitDoors] : visitDoors;
      if (runtime.mode !== 'walk' || runtime.frozen) {
        runtime.tapPoints.length = 0;
        gate.update(DT, null, false);
        return;
      }
      const w = runtime.controller.walker;
      const door = nearestDoor({ x: w.x, z: w.z }, WALK_IN_RADIUS, privateDoors);
      const pushing = door ? isHeadingToward(w.vx, w.vz, door.x - w.x, door.z - w.z) : false;
      if (gate.update(DT, door?.locationId ?? null, pushing) && door) {
        runtime.tapPoints.length = 0;
        gameEvents.emit('interact', { interactableId: doorId(door.locationId) });
        return;
      }
      // Taps on the door or the building front.
      for (const tap of runtime.tapPoints.splice(0)) {
        const tapped = nearestDoor(tap, DOOR_TAP_RADIUS, privateDoors);
        if (tapped && Math.hypot(tapped.x - w.x, tapped.z - w.z) <= ENTRY_RADIUS - 1) {
          gameEvents.emit('interact', { interactableId: doorId(tapped.locationId) });
          return;
        }
      }
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [runtime]);
}
