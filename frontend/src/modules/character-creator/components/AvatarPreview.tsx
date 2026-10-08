'use client';

import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { Appearance, Gender, Outfit } from '@insidelife/shared';
import { Avatar, type AvatarClip, type AvatarHandle } from '@/common/three/avatar';

export interface AvatarPreviewProps {
  readonly appearance: Appearance;
  readonly gender: Gender;
  readonly outfit: Outfit;
  /** Bumps on every look change: the avatar waves to say "I see you". */
  readonly changeTick: number;
  readonly animation?: AvatarClip;
  readonly reducedMotion: boolean;
}

/** Turntable studio: soft key + warm fill + cool rim, a danfo-yellow plinth, slow auto-rotate (drag to spin). */
export function AvatarPreview({ appearance, gender, outfit, changeTick, animation = 'idle', reducedMotion }: AvatarPreviewProps) {
  const handle = useRef<AvatarHandle>(null);

  useEffect(() => {
    if (changeTick > 0) handle.current?.gesture('wave', 1.7);
  }, [changeTick]);

  return (
    <Canvas
      className="!absolute inset-0"
      dpr={[1, 1.75]}
      camera={{ position: [0, 1.05, 4.6], fov: 28 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      aria-hidden
    >
      <hemisphereLight args={['#fff1da', '#3b2b20', 1.25]} />
      <directionalLight position={[2.5, 4, 3.5]} intensity={2.3} color="#fff0d8" />
      <directionalLight position={[-3, 2, -2.5]} intensity={1.3} color="#9fd2ff" />
      <pointLight position={[-1.6, 1.2, 1.6]} intensity={2.2} distance={6} color="#ffb36b" />
      <Plinth />
      <Avatar ref={handle} appearance={appearance} gender={gender} outfit={outfit} animation={animation} mood={80} shadow />
      <OrbitControls
        target={[0, 0.86, 0]}
        enablePan={false}
        enableZoom={false}
        autoRotate={!reducedMotion}
        autoRotateSpeed={0.9}
        minPolarAngle={Math.PI * 0.32}
        maxPolarAngle={Math.PI * 0.52}
        enableDamping
        makeDefault
      />
    </Canvas>
  );
}

function Plinth() {
  return (
    <group>
      <mesh position={[0, -0.05, 0]}>
        <cylinderGeometry args={[0.72, 0.76, 0.1, 64]} />
        <meshStandardMaterial color="#f6b90b" roughness={0.55} />
      </mesh>
      {/* Danfo double stripe around the plinth. */}
      <mesh position={[0, -0.03, 0]}>
        <cylinderGeometry args={[0.735, 0.735, 0.014, 64, 1, true]} />
        <meshStandardMaterial color="#0e2733" roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.065, 0]}>
        <cylinderGeometry args={[0.752, 0.752, 0.014, 64, 1, true]} />
        <meshStandardMaterial color="#0e2733" roughness={0.6} />
      </mesh>
    </group>
  );
}
