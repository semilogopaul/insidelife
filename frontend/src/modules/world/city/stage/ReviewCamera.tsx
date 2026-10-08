'use client';

import type { WorldPoint } from '@insidelife/shared';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { publishLivePose } from '../../navigation/live-pose';

/**
 * Temporary orbit/fly camera for reviewing the city until the play layer owns the camera. Its focus point stands in
 * for the player (live pose) so GPS, minimap and shadows can be reviewed.
 */

export interface ReviewCameraProps {
  readonly focus: WorldPoint;
  /** Camera offset from the focus (metres). */
  readonly offset?: readonly [number, number, number];
}

const forward = new Vector3();

export function ReviewCamera({ focus, offset = [-55, 48, 70] }: ReviewCameraProps) {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((state) => state.camera);
  const [ox, oy, oz] = offset;

  useEffect(() => {
    camera.position.set(focus.x + ox, oy, focus.z + oz);
    controls.current?.target.set(focus.x, 0, focus.z);
    controls.current?.update();
  }, [camera, focus.x, focus.z, ox, oy, oz]);

  useFrame(() => {
    const target = controls.current?.target;
    if (!target) return;
    camera.getWorldDirection(forward);
    publishLivePose(target.x, target.z, Math.atan2(forward.z, forward.x), 0);
  });

  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.12} maxPolarAngle={Math.PI * 0.48} minDistance={6} maxDistance={700} />;
}
