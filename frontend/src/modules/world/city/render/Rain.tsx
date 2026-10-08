'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, ShaderMaterial, type LineSegments } from 'three';
import { atmosphereFrame } from '../lib/atmosphere-frame';
import { setUniform } from '../lib/mutate';

/**
 * Rain as GPU-animated streaks in a box that follows the camera (one line draw). Density and opacity follow the
 * weather; nothing is drawn when it is dry.
 */

const BOX = 70;
const HEIGHT = 34;

const VERTEX = /* glsl */ `
attribute vec4 aDrop;
uniform float uTime;
uniform vec3 uOrigin;
varying float vFade;
void main() {
  float fall = 26.0 + aDrop.w * 8.0;
  float y = mod( aDrop.y * ${HEIGHT.toFixed(1)} - uTime * fall, ${HEIGHT.toFixed(1)} );
  vec3 p = vec3(
    uOrigin.x + mod( aDrop.x * ${BOX.toFixed(1)} - uOrigin.x, ${BOX.toFixed(1)} ) - ${(BOX / 2).toFixed(1)},
    uOrigin.y - ${(HEIGHT / 2).toFixed(1)} + y,
    uOrigin.z + mod( aDrop.z * ${BOX.toFixed(1)} - uOrigin.z, ${BOX.toFixed(1)} ) - ${(BOX / 2).toFixed(1)}
  );
  // Tail vertex (position.y = 1) trails up-wind.
  p += vec3( 0.25, 1.1, 0.12 ) * position.y;
  vec4 mv = modelViewMatrix * vec4( p, 1.0 );
  vFade = clamp( 1.0 - length( mv.xyz ) / 60.0, 0.0, 1.0 );
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uOpacity;
varying float vFade;
void main() {
  gl_FragColor = vec4( 0.78, 0.84, 0.9, uOpacity * vFade );
}
`;

export function Rain({ drops }: { readonly drops: number }) {
  const ref = useRef<LineSegments>(null);
  const resources = useMemo(() => {
    const geometry = new BufferGeometry();
    const positions = new Float32Array(drops * 2 * 3);
    const seeds = new Float32Array(drops * 2 * 4);
    let seed = 1;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < drops; i++) {
      const drop = [random(), random(), random(), random()];
      for (let v = 0; v < 2; v++) {
        positions[(i * 2 + v) * 3 + 1] = v;
        seeds.set(drop, (i * 2 + v) * 4);
      }
    }
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('aDrop', new BufferAttribute(seeds, 4));
    const material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uOrigin: { value: [0, 0, 0] }, uOpacity: { value: 0 } },
    });
    return { geometry, material };
  }, [drops]);

  useEffect(
    () => () => {
      resources.geometry.dispose();
      resources.material.dispose();
    },
    [resources],
  );

  useFrame((state) => {
    const rain = atmosphereFrame.rain;
    if (ref.current) ref.current.visible = rain > 0.02;
    if (rain <= 0.02) return;
    const { material, geometry } = resources;
    const { x, y, z } = state.camera.position;
    setUniform(material, 'uTime', state.clock.elapsedTime);
    setUniform(material, 'uOrigin', [x, y, z]);
    setUniform(material, 'uOpacity', 0.32 * rain);
    geometry.setDrawRange(0, Math.floor(drops * 2 * Math.min(1, rain)));
  });

  return <lineSegments ref={ref} geometry={resources.geometry} material={resources.material} frustumCulled={false} renderOrder={4} />;
}
