'use client';

import { useMemo } from 'react';
import { Box3, type BufferGeometry } from 'three';
import { Avatar, npcLook } from '@/common/three/avatar';
import { PLAYER_SCALE } from '../runtime/play-runtime';
import { vehicleScale } from './vehicle-kit';
import { useKit } from './VehicleKitProvider';

export interface DoorSpot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Fallback when the kit isn't loaded yet (Kenney van at city scale, roughly). */
const DEFAULT_DOOR: DoorSpot = { x: -1.0, y: 0.38, z: 0.2 };
const box = new Box3();

/**
 * Where a danfo conductor hangs, vehicle-local (+z forward, −x is the bus's right): on the step of the sliding door
 * on the kerb side, just behind the front doors, leaning out over the road.
 */
export function danfoDoor(geometry: BufferGeometry | undefined): DoorSpot {
  if (!geometry) return DEFAULT_DOOR;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  box.copy(geometry.boundingBox ?? box);
  const scale = vehicleScale('danfo');
  const length = (box.max.z - box.min.z) * scale;
  const centre = ((box.max.z + box.min.z) / 2) * scale;
  // Feet on the step just inside the body line; the sliding door sits a little ahead of the middle.
  return { x: box.min.x * scale + 0.06, y: 0.38, z: centre + length * 0.06 };
}

export function useDanfoDoor(): DoorSpot {
  const kit = useKit();
  return useMemo(() => danfoDoor(kit.geometries.get('danfo')), [kit]);
}

/**
 * The conductor himself: a street NPC in the `hang` pose, placed at `useDanfoDoor()` inside the bus's group.
 * `parentScale` undoes a scaled parent (the player's car root is at city scale).
 */
export function DanfoConductor({ seed, door, parentScale = 1 }: { readonly seed: string; readonly door: DoorSpot; readonly parentScale?: number }) {
  const look = useMemo(() => npcLook(`conductor:${seed}`, 'street', 'male'), [seed]);
  return (
    <Avatar
      appearance={look.appearance}
      outfit={look.outfit}
      clothing={look.clothing}
      gender={look.gender}
      lod="low"
      deferBuild
      shadow={false}
      animation="hang"
      props={false}
      scale={PLAYER_SCALE / parentScale}
      position={[door.x / parentScale, door.y / parentScale, door.z / parentScale]}
    />
  );
}
