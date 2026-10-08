'use client';

import { CITY_MAP } from '@insidelife/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, Matrix4, MeshBasicMaterial, RingGeometry, type InstancedMesh } from 'three';
import { PAVEMENT_Y } from '../layout/placements';
import { setProps } from '../lib/mutate';

/** A soft Danfo-yellow ring on the pavement at every venue door, breathing slowly (one instanced draw). */
export function DoorMarkers() {
  const ref = useRef<InstancedMesh>(null);
  const doors = useMemo(() => CITY_MAP.lots.filter((lot) => lot.kind === 'venue' && lot.entrance).map((lot) => lot.entrance!.position), []);
  const resources = useMemo(
    () => ({
      geometry: new RingGeometry(1.05, 1.4, 40).rotateX(-Math.PI / 2),
      material: new MeshBasicMaterial({ color: new Color('#f6b90b'), transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, toneMapped: false }),
    }),
    [],
  );

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new Matrix4();
    doors.forEach((door, i) => mesh.setMatrixAt(i, matrix.makeTranslation(door.x, PAVEMENT_Y + 0.03, door.z)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [doors]);

  useEffect(
    () => () => {
      resources.geometry.dispose();
      resources.material.dispose();
    },
    [resources],
  );

  useFrame(({ clock }) => {
    setProps(resources.material, { opacity: 0.42 + Math.sin(clock.elapsedTime * 2.2) * 0.18 });
  });

  return <instancedMesh ref={ref} args={[resources.geometry, resources.material, doors.length]} renderOrder={3} />;
}
