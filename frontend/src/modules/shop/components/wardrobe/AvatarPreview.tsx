'use client';

import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import type { Appearance, Outfit } from '@insidelife/shared';
import { Avatar } from '@/common/three/avatar';

export interface AvatarPreviewProps {
  readonly appearance: Appearance;
  readonly outfit: Outfit;
  readonly mood: number;
}

/**
 * The dressing-room mirror: a small, separate R3F canvas with your avatar on a slow turntable (drag to turn).
 * Lazy-loaded by the wardrobe; if WebGL fails, the wardrobe still works without it.
 */
export function AvatarPreview({ appearance, outfit, mood }: AvatarPreviewProps) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0.95, 3.7], fov: 30 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
    >
      <hemisphereLight args={['#fff4e2', '#8a6a4a', 1.35]} />
      <directionalLight position={[3, 6, 5]} intensity={2.1} color="#fff1dc" />
      <directionalLight position={[-4, 3, -4]} intensity={0.9} color="#b9d7ff" />
      <Avatar appearance={appearance} outfit={outfit} animation="idle" mood={mood} lod="high" />
      <OrbitControls
        target={[0, 0.62, 0]}
        enableZoom={false}
        enablePan={false}
        autoRotate
        autoRotateSpeed={1.4}
        minPolarAngle={Math.PI / 2.6}
        maxPolarAngle={Math.PI / 1.9}
        makeDefault
      />
    </Canvas>
  );
}
