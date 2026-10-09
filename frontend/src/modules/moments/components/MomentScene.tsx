'use client';

import { Canvas } from '@react-three/fiber';
import { useMemo } from 'react';
import type { Appearance, Gender, Outfit, SocialMomentDto } from '@insidelife/shared';
import { Avatar, npcLook } from '@/common/three/avatar';

/** You and them, face to face, playing the hug or kiss clip. A small separate canvas like the wardrobe mirror. */
export function MomentScene({
  moment,
  me,
}: {
  readonly moment: SocialMomentDto;
  readonly me: { readonly appearance: Appearance; readonly outfit: Outfit; readonly gender: Gender };
}) {
  const them = useMemo(() => {
    const other = moment.with;
    if (other.appearance && other.outfit)
      return {
        appearance: other.appearance,
        outfit: other.outfit,
        clothing: undefined,
        gender: other.gender,
      };
    const look = npcLook(other.seed, 'casual', other.gender);
    return {
      appearance: look.appearance,
      outfit: {} as Outfit,
      clothing: look.clothing,
      gender: look.gender,
    };
  }, [moment]);
  // The heads are big (chibi): for a kiss stand far enough apart that they meet, not merge; for a hug the heads go
  // past each other (offset to one side) so the bodies come close.
  const gap = moment.kind === 'kiss' ? 0.36 : 0.22;
  const side = moment.kind === 'hug' ? 0.12 : 0;
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [4.2, 1.3, 0.25], fov: 30 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      onCreated={({ camera }) => camera.lookAt(0, 0.88, 0)}
    >
      <hemisphereLight args={['#fff4e2', '#8a6a4a', 1.35]} />
      <directionalLight position={[3, 6, 5]} intensity={2.1} color="#fff1dc" />
      <directionalLight position={[-4, 3, -4]} intensity={0.9} color="#ffc9d6" />
      <Avatar
        appearance={me.appearance}
        outfit={me.outfit}
        gender={me.gender}
        animation={moment.kind}
        position={[-side, 0, -gap]}
        rotationY={0}
        lod="high"
        mood={90}
      />
      <Avatar
        appearance={them.appearance}
        outfit={them.outfit}
        clothing={them.clothing}
        gender={them.gender}
        animation={moment.kind}
        position={[side, 0, gap]}
        rotationY={Math.PI}
        lod="high"
        mood={90}
        seed={7}
      />
    </Canvas>
  );
}
