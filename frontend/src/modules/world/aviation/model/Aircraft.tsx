'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { DoubleSide, MeshBasicMaterial, type Group, type Mesh } from 'three';
import { createSurfaceMaterial } from '@/common/three/materials/surface-material';
import type { AircraftClass, AircraftLivery } from '../contract';
import { AIRCRAFT_SPECS } from './aircraft-spec';
import { buildAircraft } from './build-aircraft';
import { buildDecalGeometry, createDecalTexture, decalQuads } from './decals';

export interface AircraftProps {
  readonly cls: AircraftClass;
  readonly livery: AircraftLivery;
  /** World position of the point on the ground under the middle of the fuselage. */
  readonly position?: readonly [number, number, number];
  /** Degrees about +Y (0 = nose towards +Z). */
  readonly rotation?: number;
  /** Real size is ~3x the walking avatar's world: pass the scale the scene needs. */
  readonly scale?: number;
  /** Spin the propellers (cheap: one ref rotation, no state). */
  readonly spin?: boolean;
  readonly castShadow?: boolean;
}

/**
 * A low-poly aircraft in a livery: one merged body mesh, one decal mesh (name and registration, a canvas texture) and
 * the propellers. Everything it creates is disposed on unmount or when the class/livery changes.
 */
export function Aircraft({ cls, livery, position = [0, 0, 0], rotation = 0, scale = 1, spin = false, castShadow = false }: AircraftProps) {
  const { base, accent, name, registration } = livery;
  const model = useMemo(() => buildAircraft(cls, { base, accent }), [cls, base, accent]);
  const material = useMemo(() => createSurfaceMaterial({ roughness: 1, metalness: 0 }), []);
  const decals = useMemo(() => {
    const quads = decalQuads(AIRCRAFT_SPECS[cls], { name, registration });
    if (quads.length === 0 || typeof document === 'undefined') return null;
    const texture = createDecalTexture({ base, accent, name, registration });
    const decalMaterial = new MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.35, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false });
    return { geometry: buildDecalGeometry(quads), texture, material: decalMaterial };
  }, [cls, base, accent, name, registration]);
  const propGeometries = model.propellers;
  const hubs = useRef<Array<Group | null>>([]);
  const bodyRef = useRef<Mesh>(null);

  useEffect(() => () => {
    model.body.dispose();
    for (const hub of model.propellers) hub.geometry.dispose();
  }, [model]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => {
    decals?.geometry.dispose();
    decals?.texture.dispose();
    decals?.material.dispose();
  }, [decals]);

  useFrame((_, delta) => {
    if (!spin) return;
    for (const hub of hubs.current) if (hub) hub.rotation.z += delta * 38;
  });

  return (
    <group position={position as [number, number, number]} rotation-y={(rotation * Math.PI) / 180} scale={scale} name={`aircraft:${cls}`}>
      <mesh ref={bodyRef} geometry={model.body} material={material} castShadow={castShadow} />
      {decals && <mesh geometry={decals.geometry} material={decals.material} renderOrder={2} />}
      {propGeometries.map((hub, index) => (
        <group
          key={`${hub.position.join(',')}`}
          ref={(node) => {
            hubs.current[index] = node;
          }}
          position={hub.position as [number, number, number]}
        >
          <mesh geometry={hub.geometry} material={material} />
        </group>
      ))}
    </group>
  );
}
