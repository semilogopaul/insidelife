'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { ROAD_Y } from '../../city/layout/placements';
import type { PlayRuntime } from '../runtime/play-runtime';
import { VehicleBatch } from '../vehicles/vehicle-batch';
import type { RenderVehicleModel } from '../vehicles/vehicle-kit';
import { useKit } from '../vehicles/VehicleKitProvider';
import type { TrafficCar } from './traffic-sim';
import { useDisposeOnUnmount } from '../lib/use-dispose';

/** Extra batch slots for other players' cars. */
export const REMOTE_CAR_SLOTS = 16;

const CAR_MODELS: readonly RenderVehicleModel[] = ['sedan', 'taxi', 'suv', 'hatchback-sports', 'sedan', 'van', 'sedan-sports', 'taxi', 'suv-luxury', 'truck', 'delivery', 'sedan', 'grand-suv', 'sedan', 'taxi', 'box-suv', 'suv', 'coupe-suv'];
/** Near-white multipliers so identical models don't look cloned. */
const TINTS = [0xffffff, 0xf2f2f2, 0xfff4e6, 0xe9eef5, 0xf7f7f0];

export function trafficModel(car: TrafficCar): RenderVehicleModel {
  if (car.kind === 'danfo') return 'danfo';
  if (car.kind === 'keke') return 'keke';
  return CAR_MODELS[car.variant % CAR_MODELS.length] as RenderVehicleModel;
}

/** Ambient traffic (and other players' cars, through the runtime's batch) in one BatchedMesh. */
export function TrafficLayer({ runtime, castShadow }: { readonly runtime: PlayRuntime; readonly castShadow: boolean }) {
  const kit = useKit();
  const batch = useMemo(() => new VehicleBatch(kit, runtime.traffic.cars.length + REMOTE_CAR_SLOTS), [kit, runtime]);

  useDisposeOnUnmount(batch, () => batch.dispose());
  useEffect(() => {
    runtime.attachVehicleBatch(batch);
    return () => {
      if (runtime.vehicleBatch === batch) runtime.attachVehicleBatch(null);
    };
  }, [runtime, batch]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (const car of runtime.traffic.cars) {
      if (!car.active) {
        batch.hide(car.index);
        continue;
      }
      // Danfos and keke bounce a little on Lagos roads.
      const bounce = car.kind === 'car' ? 0 : Math.abs(Math.sin(t * 7 + car.index * 1.7)) * Math.min(1, car.speed / 6) * 0.05;
      batch.set(car.index, trafficModel(car), car.x, ROAD_Y + bounce, car.z, car.heading, car.kind === 'car' ? (TINTS[car.variant % TINTS.length] as number) : 0xffffff);
    }
  }, -3);

  return <primitive object={batch.mesh} castShadow={castShadow} receiveShadow />;
}
