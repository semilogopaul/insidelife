'use client';

import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo } from 'react';
import { PerspectiveCamera, Vector3, type Camera } from 'three';

export interface DollhouseFraming {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly distance: number;
}

/**
 * 3/4 dollhouse framing that fits the room in view for any aspect ratio (phones get pulled back). Pure — exported
 * for tests and for the world engineer's own camera rig.
 */
export function dollhouseFraming(width: number, depth: number, height: number, fovDeg: number, aspect: number): DollhouseFraming {
  const radius = Math.hypot(width, depth, height * 0.6) / 2;
  const vfov = (fovDeg * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  const distance = Math.max(radius / Math.sin(vfov / 2), radius / Math.sin(hfov / 2)) * 0.84;
  const dir = new Vector3(0.62, 0.78, 0.92).normalize();
  const target: [number, number, number] = [width * 0.03, height * 0.32, depth * 0.02];
  return {
    position: [target[0] + dir.x * distance, target[1] + dir.y * distance, target[2] + dir.z * distance],
    target,
    distance,
  };
}

/** Point a camera at a framing (module-level so React's compiler rules treat it as an imperative call). */
export function applyFraming(camera: Camera, framing: DollhouseFraming): void {
  camera.position.set(framing.position[0], framing.position[1], framing.position[2]);
  camera.lookAt(framing.target[0], framing.target[1], framing.target[2]);
  if (camera instanceof PerspectiveCamera) {
    camera.near = 0.1;
    camera.far = framing.distance * 6;
    camera.updateProjectionMatrix();
  }
}

export interface DollhouseCameraProps {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  /** Let players rotate/zoom a little (within the cutaway's front-right quadrant). */
  readonly interactive?: boolean;
}

export function DollhouseCamera({ width, depth, height, interactive = true }: DollhouseCameraProps) {
  const camera = useThree((state) => state.camera);
  const aspect = useThree((state) => state.size.width / Math.max(1, state.size.height));
  const fov = camera instanceof PerspectiveCamera ? camera.fov : 40;
  const framing = useMemo(() => dollhouseFraming(width, depth, height, fov, aspect), [width, depth, height, fov, aspect]);

  useLayoutEffect(() => applyFraming(camera, framing), [camera, framing]);

  if (!interactive) return null;
  return (
    <OrbitControls
      makeDefault
      target={[framing.target[0], framing.target[1], framing.target[2]]}
      enablePan={false}
      enableDamping
      minDistance={framing.distance * 0.45}
      maxDistance={framing.distance * 1.15}
      minPolarAngle={0.45}
      maxPolarAngle={1.2}
      minAzimuthAngle={0.05}
      maxAzimuthAngle={1.45}
    />
  );
}
