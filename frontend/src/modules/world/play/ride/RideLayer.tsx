'use client';

import {
  CITY_BOUNDS,
  createRng,
  findRoute,
  homeEntrance,
  homeKey,
  homeLocationId,
  venueEntrance,
  type CharacterSnapshotDto,
  type DistrictId,
  type TravelDto,
  type WorldPoint,
} from '@insidelife/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { Group } from 'three';
import { queryKeys } from '@/common/api/query-keys';
import { gameClock } from '@/common/game/game-clock';
import { gameEvents } from '@/common/game/game-events';
import { Avatar, npcLook } from '@/common/three/avatar';
import { ROAD_Y } from '../../city/layout/placements';
import { damp, dampAngle, yawFromHeading } from '../physics/math';
import { groundHeightAt } from '../physics/surface';
import { PLAYER_SCALE, type PlayRuntime } from '../runtime/play-runtime';
import { isDrivableModel, vehicleScale, type RenderVehicleModel } from '../vehicles/vehicle-kit';
import { DanfoConductor, useDanfoDoor } from '../vehicles/DanfoConductor';
import { useKit } from '../vehicles/VehicleKitProvider';
import { buildRidePath, pointAlong, rideProgress, type PathPoint, type RidePath } from './ride-path';

/** Vehicle per booked mode. */
function modelFor(travel: TravelDto, ownCar: string | null): RenderVehicleModel | null {
  switch (travel.mode) {
    case 'danfo':
      return 'danfo';
    case 'bolt':
      return 'taxi';
    case 'brt':
      return 'brt';
    case 'keke':
      return 'keke';
    case 'okada':
      return 'okada';
    case 'car':
      return ownCar && isDrivableModel(ownCar) ? ownCar : 'sedan';
    case 'walk':
      return null;
  }
}

/** Where the player sits (vehicle-local: right, up, forward; metres) on open vehicles. */
const SEATS: Partial<Record<RenderVehicleModel, { x: number; y: number; z: number }>> = {
  okada: { x: 0, y: 0.82 - 0.36 * PLAYER_SCALE, z: -0.42 },
  keke: { x: 0.25, y: 0.83 - 0.36 * PLAYER_SCALE, z: -0.75 },
};

/** The driver/rider NPC on open vehicles. */
const DRIVERS: Partial<Record<RenderVehicleModel, { x: number; y: number; z: number }>> = {
  okada: { x: 0, y: 0.82 - 0.36 * PLAYER_SCALE, z: 0.12 },
  keke: { x: 0, y: 0.75 - 0.36 * PLAYER_SCALE, z: 0.35 },
};

function entranceOf(locationId: string, snapshot: CharacterSnapshotDto): WorldPoint | null {
  const { character } = snapshot;
  if (locationId === homeLocationId(character.id)) return homeEntrance(homeKey(character.id, character.homePropertyId), character.homeDistrictId as DistrictId).position;
  return venueEntrance(locationId)?.position ?? null;
}

/**
 * Plays a booked ride back along the GPS route, timed by the server (`departAt` → `arriveAt`, game minutes): the
 * right vehicle (danfo, Bolt taxi, BRT, keke, okada, or your own car on auto-drive), the camera riding along, the
 * danfo conductor hanging out of the door and shouting now and then. When the clock passes arrival it asks the server for the fresh snapshot
 * (which puts you inside the destination).
 */
export function RideLayer({ runtime, snapshot, travel, ownCar }: { readonly runtime: PlayRuntime; readonly snapshot: CharacterSnapshotDto; readonly travel: TravelDto; readonly ownCar: string | null }) {
  const kit = useKit();
  const client = useQueryClient();
  const group = useRef<Group>(null);
  const model = modelFor(travel, ownCar);

  const path = useMemo<RidePath>(() => {
    const origin = entranceOf(travel.fromLocationId, snapshot) ?? { x: runtime.controller.walker.x, z: runtime.controller.walker.z };
    const destination = entranceOf(travel.toLocationId, snapshot) ?? { x: CITY_BOUNDS.minX + 6, z: origin.z };
    const route = findRoute(origin, destination);
    if (route) return buildRidePath(route, travel.mode === 'walk' ? 4.55 : 1.8);
    const xs = new Float32Array([origin.x, destination.x]);
    const zs = new Float32Array([origin.z, destination.z]);
    const length = Math.hypot(destination.x - origin.x, destination.z - origin.z);
    return { xs, zs, cumulative: new Float32Array([0, length]), length };
    // The route is fixed per trip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travel.fromLocationId, travel.toLocationId, travel.departAt, travel.mode]);

  const driver = useMemo(() => (model && DRIVERS[model] ? npcLook(`ride:${travel.departAt}`, 'street', 'male') : null), [model, travel.departAt]);
  const door = useDanfoDoor();
  const point = useRef<PathPoint>({ x: 0, z: 0, heading: 0 });
  const last = useRef({ along: -1, at: 0, heading: 0, speed: 0, conductorAt: 0, refetchAt: 0 });

  useEffect(() => {
    const first = pointAlong(path, 0, { x: 0, z: 0, heading: 0 });
    runtime.beginRide(model === null, model ? (SEATS[model] ?? null) : null, first.x, first.z, first.heading);
    return () => runtime.endRide();
  }, [runtime, path, model]);

  const rng = useMemo(() => createRng(`conductor:${travel.departAt}`), [travel.departAt]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const now = gameClock.now();
    const progress = gameClock.ready ? rideProgress(now, travel.departAt, travel.arriveAt, travel.mode === 'danfo') : 0;
    const along = progress * path.length;
    const p = pointAlong(path, along, point.current);
    const state = last.current;
    const t = performance.now();
    const speed = state.along >= 0 && t > state.at ? Math.abs(along - state.along) / ((t - state.at) / 1000) : 0;
    if (state.along < 0) state.heading = p.heading;
    state.along = along;
    state.at = t;
    state.heading = dampAngle(state.heading, p.heading, 7, dt);
    state.speed += (Math.min(speed, 30) - state.speed) * damp(4, dt);
    runtime.setRidePose(p.x, model === null ? groundHeightAt(p.x, p.z) : ROAD_Y, p.z, state.heading, state.speed);

    const object = group.current;
    if (object) {
      const bounce = model === 'danfo' || model === 'keke' ? Math.abs(Math.sin(t * 0.007)) * Math.min(1, state.speed / 5) * 0.05 : 0;
      object.position.set(p.x, ROAD_Y + bounce, p.z);
      object.rotation.y = yawFromHeading(state.heading);
    }

    // "Oshodi! Oshodi! Enter with your change!"
    if (travel.mode === 'danfo' && progress < 1 && t > state.conductorAt) {
      if (state.conductorAt > 0) gameEvents.emit('sfx', { id: 'danfo-conductor', volume: 0.8 });
      state.conductorAt = t + 9000 + rng.next() * 9000;
    }
    // Arrived: ask the server (it settles the trip and puts us inside), politely and repeatedly until it does.
    if (gameClock.ready && now >= travel.arriveAt && t > state.refetchAt) {
      state.refetchAt = t + 3000;
      void client.invalidateQueries({ queryKey: queryKeys.snapshot });
    }
  }, -4.5);

  const geometry = model ? kit.geometries.get(model) : undefined;
  const driverSeat = model ? DRIVERS[model] : undefined;
  return (
    <group ref={group}>
      {geometry && model && <mesh geometry={geometry} material={kit.material} scale={vehicleScale(model)} castShadow receiveShadow />}
      {model === 'danfo' && <DanfoConductor seed={String(travel.departAt)} door={door} />}
      {driver && driverSeat && (
        <Avatar
          appearance={driver.appearance}
          outfit={driver.outfit}
          clothing={driver.clothing}
          gender={driver.gender}
          lod="low"
          deferBuild
          shadow={false}
          animation="drive"
          stance="sit"
          props={false}
          scale={PLAYER_SCALE}
          position={[driverSeat.x, driverSeat.y, driverSeat.z]}
        />
      )}
    </group>
  );
}
