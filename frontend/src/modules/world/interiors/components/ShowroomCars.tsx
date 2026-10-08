'use client';

import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Group } from 'three';
import { CARS_URL } from '../kit/furniture-kit';
import type { CarPlacement } from '../templates/types';

/** Car-dealer showroom cars (Kenney car kit, textured) on slowly turning plinths. */
export function ShowroomCars({ cars }: { readonly cars: readonly CarPlacement[] }) {
  const { scene } = useGLTF(CARS_URL, false, true);
  return (
    <group name="showroom-cars">
      {cars.map((car) => (
        <ShowroomCar key={`${car.model}-${car.at.join(',')}`} root={scene} car={car} />
      ))}
    </group>
  );
}

function ShowroomCar({ root, car }: { readonly root: Group; readonly car: CarPlacement }) {
  const model = useMemo(() => root.getObjectByName(car.model)?.clone(true) ?? null, [root, car.model]);
  const ref = useRef<Group>(null);
  useFrame((_, delta) => {
    if (car.spin && ref.current) ref.current.rotation.y += delta * 0.25;
  });
  if (!model) return null;
  return (
    <group ref={ref} position={[car.at[0], 0.12, car.at[1]]} rotation-y={((car.rot ?? 0) * Math.PI) / 180} scale={1.35}>
      <primitive object={model} />
    </group>
  );
}

useGLTF.preload(CARS_URL, false, true);
