'use client';

import type { WorldPoint } from '@insidelife/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, Color, CylinderGeometry, DoubleSide, MeshBasicMaterial, RingGeometry, ShaderMaterial, type Group } from 'three';
import { setUniform } from '../city/lib/mutate';

/** A soft column of Danfo-yellow light over the destination door, visible across the city, plus a ground ring. */

const VERTEX = /* glsl */ `
varying float vHeight;
void main() {
  vHeight = uv.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
varying float vHeight;
void main() {
  float pulse = 0.8 + 0.2 * sin( uTime * 2.4 - vHeight * 6.0 );
  float alpha = ( 1.0 - vHeight ) * ( 1.0 - vHeight ) * 0.55 * pulse;
  gl_FragColor = vec4( uColor * alpha, alpha );
  #include <colorspace_fragment>
}
`;

export function DestinationBeacon({ at }: { readonly at: WorldPoint }) {
  const group = useRef<Group>(null);
  const resources = useMemo(() => {
    const column = new CylinderGeometry(1.5, 1.5, 46, 20, 1, true).translate(0, 23, 0);
    const ring = new RingGeometry(1.8, 2.4, 40).rotateX(-Math.PI / 2);
    const columnMaterial = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      toneMapped: false,
      uniforms: { uColor: { value: new Color('#ffc21a') }, uTime: { value: 0 } },
    });
    const ringMaterial = new MeshBasicMaterial({ color: '#ffc21a', transparent: true, opacity: 0.75, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
    return { column, ring, columnMaterial, ringMaterial };
  }, []);

  useEffect(
    () => () => {
      for (const resource of Object.values(resources)) resource.dispose();
    },
    [resources],
  );

  useFrame(({ clock }) => {
    setUniform(resources.columnMaterial, 'uTime', clock.elapsedTime);
    if (group.current) {
      const s = 1 + 0.12 * Math.sin(clock.elapsedTime * 2.4);
      group.current.children[1]?.scale.set(s, 1, s);
    }
  });

  return (
    <group ref={group} position={[at.x, 0.3, at.z]}>
      <mesh geometry={resources.column} material={resources.columnMaterial} renderOrder={6} />
      <mesh geometry={resources.ring} material={resources.ringMaterial} renderOrder={6} />
    </group>
  );
}
