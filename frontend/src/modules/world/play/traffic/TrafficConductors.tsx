'use client';

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import { ROAD_Y } from '../../city/layout/placements';
import { yawFromHeading } from '../physics/math';
import type { PlayRuntime } from '../runtime/play-runtime';
import { DanfoConductor, useDanfoDoor } from '../vehicles/DanfoConductor';

/** Only danfos this close to the camera get a conductor drawn (beyond that he's a few pixels). */
const RANGE = 80;
/** Seconds between searches for newly arrived danfos (slots keep following their bus every frame). */
const SCAN_INTERVAL = 0.5;

/**
 * Conductors hanging off the nearest traffic danfos. A small pool of avatars follows the closest buses; a slot keeps
 * its bus while it stays in range so faces don't swap between buses. Bounce matches TrafficLayer.
 */
export function TrafficConductors({ runtime, count }: { readonly runtime: PlayRuntime; readonly count: number }) {
  const door = useDanfoDoor();
  const groups = useRef<(Group | null)[]>([]);
  const assigned = useRef<number[]>([]);
  const scannedAt = useRef(-Infinity);

  useFrame(({ camera, clock }) => {
    const cars = runtime.traffic.cars;
    const cx = camera.position.x;
    const cz = camera.position.z;
    const inRange = (index: number): boolean => {
      const car = cars[index];
      return car !== undefined && car.active && car.kind === 'danfo' && (car.x - cx) ** 2 + (car.z - cz) ** 2 < RANGE * RANGE;
    };
    const slots = assigned.current;
    for (let slot = 0; slot < count; slot++) if (slots[slot] !== undefined && slots[slot] !== -1 && !inRange(slots[slot] as number)) slots[slot] = -1;
    // Fill free slots with the nearest unassigned danfos.
    if ((slots.length < count || slots.includes(-1)) && clock.elapsedTime - scannedAt.current > SCAN_INTERVAL) {
      scannedAt.current = clock.elapsedTime;
      const taken = new Set(slots);
      const candidates = cars
        .filter((car) => !taken.has(car.index) && inRange(car.index))
        .sort((a, b) => (a.x - cx) ** 2 + (a.z - cz) ** 2 - ((b.x - cx) ** 2 + (b.z - cz) ** 2));
      for (let slot = 0, next = 0; slot < count; slot++) {
        if (slots[slot] === undefined || slots[slot] === -1) slots[slot] = candidates[next++]?.index ?? -1;
      }
    }
    const t = clock.elapsedTime;
    for (let slot = 0; slot < count; slot++) {
      const group = groups.current[slot];
      if (!group) continue;
      const car = cars[slots[slot] ?? -1];
      group.visible = car !== undefined;
      if (!car) continue;
      const bounce = Math.abs(Math.sin(t * 7 + car.index * 1.7)) * Math.min(1, car.speed / 6) * 0.05;
      group.position.set(car.x, ROAD_Y + bounce, car.z);
      group.rotation.y = yawFromHeading(car.heading);
    }
  }, -2.9);

  return (
    <>
      {Array.from({ length: count }, (_, slot) => (
        <group
          key={slot}
          visible={false}
          ref={(node) => {
            groups.current[slot] = node;
          }}
        >
          <DanfoConductor seed={`traffic:${slot}`} door={door} />
        </group>
      ))}
    </>
  );
}
