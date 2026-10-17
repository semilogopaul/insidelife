'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { BoxGeometry, Color, MeshStandardMaterial, Object3D, type InstancedMesh } from 'three';
import { Aircraft } from '../model/Aircraft';
import { APRON_SCALE, atDoor, layoutApron, type ApronLayout, type ApronPlane } from './apron-layout';

export interface AirsideProps {
  /** Your plane on your stand (null: you have none, the stand stays empty). */
  readonly own: ApronPlane | null;
  /** Other players' planes, friends first, then your instance; at most six are drawn, the rest are "in a hangar". */
  readonly others: readonly ApronPlane[];
  /** Fired once each time you walk up to your plane's door. */
  readonly onBoard?: () => void;
}

export interface ApronProps extends AirsideProps {
  /** Where the walking player stands in room space (null when not walking). Read a few times a second, no React state. */
  readonly getPlayer?: () => readonly [x: number, z: number] | null;
}

const CHECK_EVERY_S = 0.15;
const PAD_COLORS = { own: '#f6b90b', other: '#c9ced4' } as const;
const dummy = new Object3D();
const tint = new Color();

/**
 * The planes on the apron: yours on your stand with a yellow pad, the others' on grey pads. Walking to your plane's
 * door (within about a metre) calls `onBoard`. Props stay out of React state: the walker's position is polled in the
 * frame loop and the callback only fires on arrival.
 */
export function Apron({ own, others, onBoard, getPlayer }: ApronProps) {
  const layout = useMemo(() => layoutApron(own, others), [own, others]);
  return (
    <group name="apron">
      <Pads layout={layout} />
      {layout.own && <Aircraft key={`own:${layout.own.id}`} cls={layout.own.cls} livery={layout.own.livery} position={[layout.own.x, 0, layout.own.z]} rotation={layout.own.rot} scale={APRON_SCALE} spin={false} castShadow />}
      {layout.others.map((plane) => (
        <Aircraft key={plane.id} cls={plane.cls} livery={plane.livery} position={[plane.x, 0, plane.z]} rotation={plane.rot} scale={APRON_SCALE} castShadow />
      ))}
      <Boarding layout={layout} onBoard={onBoard} getPlayer={getPlayer} />
    </group>
  );
}

/** One instanced mesh of flat pads under the planes. */
function Pads({ layout }: { readonly layout: ApronLayout }) {
  const planes = useMemo(() => (layout.own ? [layout.own, ...layout.others] : layout.others), [layout]);
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new BoxGeometry(1, 0.02, 1), []);
  const material = useMemo(() => new MeshStandardMaterial({ roughness: 0.95, metalness: 0 }), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useLayoutEffect(() => {
    const instances = mesh.current;
    if (!instances) return;
    planes.forEach((plane, index) => {
      dummy.position.set(plane.x, 0.012, plane.z);
      dummy.scale.set(plane.w + 0.8, 1, plane.d + 0.8);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      instances.setMatrixAt(index, dummy.matrix);
      instances.setColorAt(index, tint.set(layout.own && plane.id === layout.own.id ? PAD_COLORS.own : PAD_COLORS.other));
    });
    instances.count = planes.length;
    instances.instanceMatrix.needsUpdate = true;
    if (instances.instanceColor) instances.instanceColor.needsUpdate = true;
  }, [planes, layout.own]);
  // Seven pads at most: sized once.
  return <instancedMesh ref={mesh} args={[geometry, material, 7]} frustumCulled={false} />;
}

/** Calls `onBoard` when the walker reaches your plane's door (and again only after they have walked away). */
function Boarding({ layout, onBoard, getPlayer }: Pick<ApronProps, 'onBoard' | 'getPlayer'> & { readonly layout: ApronLayout }) {
  const clock = useRef(0);
  const inside = useRef(false);
  const primed = useRef(false);
  const own = layout.own;
  useFrame((_, delta) => {
    if (!own || !onBoard || !getPlayer) return;
    clock.current += delta;
    if (clock.current < CHECK_EVERY_S) return;
    clock.current = 0;
    const at = getPlayer();
    const near = at !== null && atDoor(own, at[0], at[1]);
    // The first sample is a baseline: stepping out of your plane puts you at its door and must not board you again.
    if (near && !inside.current && primed.current) onBoard();
    if (at !== null) primed.current = true;
    inside.current = near;
  });
  return null;
}
