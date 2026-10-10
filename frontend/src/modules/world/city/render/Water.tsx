'use client';

import { CITY_MAP, colAt, rowAt } from '@insidelife/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Color, DataTexture, LinearFilter, RedFormat, ShaderMaterial, UniformsLib, UniformsUtils, UnsignedByteType, Vector2, Vector3 } from 'three';
import { atmosphereFrame } from '../lib/atmosphere-frame';
import { WATER_Y } from './ground-geometry';
import { setUniform } from '../lib/mutate';

/**
 * Lagoon + Atlantic in one plane and one cheap shader: summed-sine normals, fresnel sky reflection, sun glint,
 * a distance-to-shore field (built once from the city grid) for shallows and animated shore foam, rougher swell
 * towards the ocean in the south. Rain flattens the glint.
 */

/** Metres per texel of the shore field (sampled in world space: cells differ in size since the roads widened). */
const TEXEL_METRES = 2.5;
const MAX_DISTANCE = 40;

function buildShoreDistance(): DataTexture {
  const { minX, minZ, maxX, maxZ } = CITY_MAP.bounds;
  const cols = Math.round((maxX - minX) / TEXEL_METRES);
  const rows = Math.round((maxZ - minZ) / TEXEL_METRES);
  const texel = (maxX - minX) / cols;
  const texelZ = (maxZ - minZ) / rows;
  const distance = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    const row = rowAt(minZ + (y + 0.5) * texelZ);
    for (let x = 0; x < cols; x++) {
      const kind = CITY_MAP.cells[row * CITY_MAP.cols + colAt(minX + (x + 0.5) * texel)] as number;
      // Water and bridges (water under the deck) are "sea"; everything else is shore.
      distance[y * cols + x] = kind === 1 || kind === 4 ? 1e6 : 0;
    }
  }
  // Two-pass chamfer distance transform.
  const D1 = 1;
  const D2 = Math.SQRT2;
  const get = (x: number, y: number): number => (x < 0 || y < 0 || x >= cols || y >= rows ? 1e6 : (distance[y * cols + x] as number));
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      distance[i] = Math.min(distance[i] as number, get(x - 1, y) + D1, get(x, y - 1) + D1, get(x - 1, y - 1) + D2, get(x + 1, y - 1) + D2);
    }
  }
  for (let y = rows - 1; y >= 0; y--) {
    for (let x = cols - 1; x >= 0; x--) {
      const i = y * cols + x;
      distance[i] = Math.min(distance[i] as number, get(x + 1, y) + D1, get(x, y + 1) + D1, get(x + 1, y + 1) + D2, get(x - 1, y + 1) + D2);
    }
  }
  const data = new Uint8Array(cols * rows);
  for (let i = 0; i < data.length; i++) data[i] = Math.round(Math.min(1, ((distance[i] as number) * texel) / MAX_DISTANCE) * 255);
  const texture = new DataTexture(data, cols, rows, RedFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4( position, 1.0 );
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
uniform sampler2D uShore;
uniform vec2 uBoundsMin;
uniform vec2 uBoundsSize;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSky;
uniform vec3 uLagoon;
uniform vec3 uOcean;
uniform vec3 uShallow;
uniform float uRain;
uniform float uNight;
varying vec3 vWorld;

void main() {
  vec2 uv = ( vWorld.xz - uBoundsMin ) / uBoundsSize;
  float inside = step( 0.0, uv.x ) * step( uv.x, 1.0 ) * step( 0.0, uv.y ) * step( uv.y, 1.0 );
  float shore = mix( 1.0, texture2D( uShore, clamp( uv, 0.0, 1.0 ) ).r, inside ) * ${MAX_DISTANCE.toFixed(1)};
  float ocean = smoothstep( 140.0, 215.0, vWorld.z );
  vec2 p = vWorld.xz;
  float t = uTime;
  // Fine ripples fade with distance so they never alias into a checkerboard of glints.
  float viewDistance = length( cameraPosition - vWorld );
  float detail = 1.0 - smoothstep( 60.0, 320.0, viewDistance );
  float swell = ( 0.6 + ocean * 1.4 ) * ( 0.35 + 0.65 * detail );
  vec3 n = normalize( vec3(
    swell * ( 0.10 * cos( p.x * 0.21 + t * 1.1 ) + 0.07 * cos( p.x * 0.47 + p.y * 0.31 - t * 1.7 ) + 0.035 * detail * cos( p.x * 1.3 - p.y * 0.9 + t * 2.6 ) ) + ocean * 0.16 * cos( p.y * 0.17 - t * 1.25 ),
    1.0,
    swell * ( 0.10 * cos( p.y * 0.19 + t * 0.9 ) + 0.07 * cos( p.y * 0.53 - p.x * 0.27 + t * 1.5 ) + 0.035 * detail * cos( p.y * 1.4 + p.x * 0.8 - t * 2.3 ) ) + ocean * 0.22 * cos( p.y * 0.23 - t * 1.6 )
  ) );
  vec3 V = normalize( cameraPosition - vWorld );
  float fresnel = pow( 1.0 - max( dot( n, V ), 0.0 ), 4.0 );
  vec3 deep = mix( uLagoon, uOcean, ocean );
  vec3 base = mix( uShallow, deep, smoothstep( 0.0, 16.0, shore ) );
  vec3 color = mix( base, uSky, clamp( fresnel * 0.75 + 0.06, 0.0, 1.0 ) );
  vec3 H = normalize( uSunDir + V );
  float glint = pow( max( dot( n, H ), 0.0 ), mix( 60.0, 220.0, detail ) ) * mix( 1.2, 4.0, detail ) + pow( max( dot( n, H ), 0.0 ), 30.0 ) * 0.15;
  color += uSunColor * glint * ( 1.0 - uRain * 0.85 ) * step( 0.0, uSunDir.y );
  float lap = 0.55 + 0.45 * sin( shore * 2.2 - t * 2.4 + p.x * 0.07 );
  float foam = ( 1.0 - smoothstep( 0.4, 2.6, shore ) ) * lap;
  foam += ocean * ( 1.0 - smoothstep( 0.0, 11.0, shore ) ) * smoothstep( 0.75, 1.0, sin( shore * 0.85 - t * 1.5 ) ) * 0.75;
  color = mix( color, vec3( 0.9, 0.92, 0.9 ) * ( 1.0 - uNight * 0.75 ), clamp( foam, 0.0, 1.0 ) * 0.75 );
  gl_FragColor = vec4( color, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export function Water() {
  const shore = useMemo(() => buildShoreDistance(), []);
  const material = useMemo(() => {
    const { minX, minZ, maxX, maxZ } = CITY_MAP.bounds;
    return new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      fog: true,
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          uTime: { value: 0 },
          uShore: { value: null },
          uBoundsMin: { value: new Vector2(minX, minZ) },
          uBoundsSize: { value: new Vector2(maxX - minX, maxZ - minZ) },
          uSunDir: { value: new Vector3(0, 1, 0) },
          uSunColor: { value: new Color() },
          uSky: { value: new Color() },
          uLagoon: { value: new Color('#2b5f5c') },
          uOcean: { value: new Color('#1d5f78') },
          uShallow: { value: new Color('#4f9a8c') },
          uRain: { value: 0 },
          uNight: { value: 0 },
        },
      ]),
    });
  }, []);

  useEffect(() => {
    setUniform(material, 'uShore', shore);
    return () => {
      material.dispose();
      shore.dispose();
    };
  }, [material, shore]);

  useFrame((state) => {
    const u = material.uniforms;
    setUniform(material, 'uTime', state.clock.elapsedTime);
    (u.uSunDir!.value as Vector3).set(...atmosphereFrame.sunDirection);
    (u.uSunColor!.value as Color).copy(atmosphereFrame.sunColor);
    (u.uSky!.value as Color).copy(atmosphereFrame.horizon);
    (u.uLagoon!.value as Color).copy(atmosphereFrame.lagoon);
    (u.uOcean!.value as Color).copy(atmosphereFrame.ocean);
    (u.uShallow!.value as Color).copy(atmosphereFrame.shallow);
    setUniform(material, 'uRain', atmosphereFrame.rain);
    setUniform(material, 'uNight', atmosphereFrame.night);
  });

  return (
    <mesh position={[0, WATER_Y, 0]} rotation-x={-Math.PI / 2} material={material} renderOrder={1}>
      <planeGeometry args={[4200, 4200, 1, 1]} />
    </mesh>
  );
}
