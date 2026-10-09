'use client';

import type { DrivenVehicleDto } from '@insidelife/shared';
import { useEffect, useMemo } from 'react';
import { Group, Mesh, type Object3D } from 'three';
import type { PlayRuntime } from '../runtime/play-runtime';
import { DanfoConductor, useDanfoDoor } from '../vehicles/DanfoConductor';
import { useKit } from '../vehicles/VehicleKitProvider';
import { createPaintedMaterial, isDrivableModel, vehicleScale } from '../vehicles/vehicle-kit';
import { useDisposeOnUnmount } from '../lib/use-dispose';

const FRONT = ['wheel-front-left', 'wheel-front-right'] as const;
const REAR = ['wheel-back-left', 'wheel-back-right'] as const;

/**
 * The player's own car: a live clone of the kit model in their paint, wheels spinning and steering (runtime-driven).
 * A danfo comes with its conductor hanging out of the door.
 */
export function PlayerCar({ runtime, vehicle, castShadow }: { readonly runtime: PlayRuntime; readonly vehicle: DrivenVehicleDto; readonly castShadow: boolean }) {
  const kit = useKit();
  const model = isDrivableModel(vehicle.model) ? vehicle.model : 'sedan';
  const door = useDanfoDoor();
  const built = useMemo(() => {
    const clone = kit.scene(model).clone(true);
    const material = createPaintedMaterial(kit.map, vehicle.color, kit.paintRect(model));
    clone.traverse((child) => {
      if (child instanceof Mesh) {
        child.material = material;
        child.castShadow = castShadow;
        child.receiveShadow = true;
      }
    });
    const find = (names: readonly string[]): Object3D[] =>
      names.map((name) => clone.getObjectByName(name)).filter((node): node is Object3D => {
        if (node) node.rotation.order = 'YXZ';
        return node !== undefined;
      });
    const root = new Group();
    root.name = 'player-car';
    root.scale.setScalar(vehicleScale(model));
    root.add(clone);
    return { root, material, body: clone.getObjectByName('body') ?? null, frontWheels: find(FRONT), rearWheels: find(REAR) };
  }, [kit, model, vehicle.color, castShadow]);

  useDisposeOnUnmount(built.material, () => built.material.dispose());
  useEffect(() => {
    runtime.registerCar(built);
    return () => runtime.registerCar(null);
  }, [runtime, built]);

  return <primitive object={built.root}>{model === 'danfo' && <DanfoConductor seed={`own:${vehicle.color}`} door={door} parentScale={vehicleScale(model)} />}</primitive>;
}
