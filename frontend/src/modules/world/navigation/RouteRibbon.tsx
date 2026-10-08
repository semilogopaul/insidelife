'use client';

import type { CityRoute, WorldPoint } from '@insidelife/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, Color, ShaderMaterial } from 'three';
import { activeRoute } from './route-state';
import { setUniform } from '../city/lib/mutate';

/**
 * The GPS ribbon: a strip laid on the right-hand lane (pavement for the walk to the door) with animated chevrons
 * flowing towards the destination. Depth-tested, unlit (reads at night), fades out behind the player.
 */

const ROAD_Y = 0.16;
const PAVEMENT_Y = 0.27;
const HALF_WIDTH = 1.15;
/** Right-hand traffic: keep the ribbon in the right lane. */
const LANE_OFFSET = 2.1;

function buildRibbon(route: CityRoute): BufferGeometry {
  const { points, cumulative, legs } = route;
  // Which points belong to off-road access legs (walk to/from the kerb).
  const access = new Array<boolean>(points.length).fill(false);
  for (const leg of legs) if (leg.kind === 'access') for (let i = leg.from; i <= leg.to; i++) access[i] = true;
  const roadEnd = (index: number): boolean => access[index] === true && (index === 0 || index === points.length - 1);

  const positions = new Float32Array(points.length * 2 * 3);
  const along = new Float32Array(points.length * 2);
  const side = new Float32Array(points.length * 2);
  for (let i = 0; i < points.length; i++) {
    const p = points[i] as WorldPoint;
    const prev = points[Math.max(0, i - 1)] as WorldPoint;
    const next = points[Math.min(points.length - 1, i + 1)] as WorldPoint;
    let dx = next.x - prev.x;
    let dz = next.z - prev.z;
    const length = Math.hypot(dx, dz) || 1;
    dx /= length;
    dz /= length;
    // Right of travel direction = (-dz, dx).
    const rx = -dz;
    const rz = dx;
    const offset = roadEnd(i) ? 0 : LANE_OFFSET;
    const y = roadEnd(i) ? PAVEMENT_Y : ROAD_Y;
    for (let s = 0; s < 2; s++) {
      const lateral = offset + (s === 0 ? -HALF_WIDTH : HALF_WIDTH);
      const o = (i * 2 + s) * 3;
      positions[o] = p.x + rx * lateral;
      positions[o + 1] = y;
      positions[o + 2] = p.z + rz * lateral;
      along[i * 2 + s] = cumulative[i] as number;
      side[i * 2 + s] = s;
    }
  }
  const indices: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = (i - 1) * 2;
    const b = i * 2;
    // Counter-clockwise seen from above (the strip faces up).
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aAlong', new BufferAttribute(along, 1));
  geometry.setAttribute('aSide', new BufferAttribute(side, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

const VERTEX = /* glsl */ `
attribute float aAlong;
attribute float aSide;
varying float vAlong;
varying float vSide;
void main() {
  vAlong = aAlong;
  vSide = aSide;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uProgress;
uniform float uLength;
uniform vec3 uCore;
uniform vec3 uChevron;
varying float vAlong;
varying float vSide;
void main() {
  float behind = smoothstep( uProgress - 6.0, uProgress + 2.0, vAlong );
  float arrive = 1.0 - smoothstep( uLength - 1.0, uLength + 0.5, vAlong );
  float across = abs( vSide - 0.5 ) * 2.0;
  float edge = 1.0 - smoothstep( 0.72, 1.0, across );
  float chevron = fract( ( vAlong - across * 1.4 ) / 4.0 - uTime * 0.9 );
  float band = smoothstep( 0.0, 0.08, chevron ) * ( 1.0 - smoothstep( 0.34, 0.42, chevron ) );
  vec3 color = mix( uCore, uChevron, band * 0.85 );
  float alpha = ( 0.62 + band * 0.33 ) * edge * behind * arrive;
  if ( alpha < 0.01 ) discard;
  gl_FragColor = vec4( color, alpha );
  #include <colorspace_fragment>
}
`;

export function RouteRibbon({ route }: { readonly route: CityRoute }) {
  const geometry = useMemo(() => buildRibbon(route), [route]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -6,
        polygonOffsetUnits: -6,
        toneMapped: false,
        uniforms: {
          uTime: { value: 0 },
          uProgress: { value: 0 },
          uLength: { value: route.length },
          uCore: { value: new Color('#f6b90b') },
          uChevron: { value: new Color('#fffbe8') },
        },
      }),
    [route.length],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ clock }) => {
    setUniform(material, 'uTime', clock.elapsedTime);
    setUniform(material, 'uProgress', activeRoute.along);
  });

  return <mesh geometry={geometry} material={material} renderOrder={5} frustumCulled={false} />;
}
