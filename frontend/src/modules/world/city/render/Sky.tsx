'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BackSide, Color, ShaderMaterial, Vector3, type Mesh } from 'three';
import { atmosphereFrame } from '../lib/atmosphere-frame';
import { setUniform } from '../lib/mutate';

/**
 * Gradient sky dome that follows the camera: horizon → zenith blend, sun disc + halo, drifting fbm clouds whose
 * cover follows the weather, and stars at night. One draw call, no textures.
 */

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w * 0.99999;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uFog;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uStars;
uniform float uCloud;
uniform float uTime;
uniform float uNight;
varying vec3 vDir;

float hash( vec3 p ) {
  p = fract( p * 0.3183099 + 0.1 );
  p *= 17.0;
  return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}
float noise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  float a = hash( vec3( i, 1.0 ) );
  float b = hash( vec3( i + vec2( 1.0, 0.0 ), 1.0 ) );
  float c = hash( vec3( i + vec2( 0.0, 1.0 ), 1.0 ) );
  float d = hash( vec3( i + vec2( 1.0, 1.0 ), 1.0 ) );
  return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}
float fbm( vec2 p ) {
  float v = 0.0;
  float a = 0.5;
  for ( int i = 0; i < 5; i++ ) {
    v += a * noise( p );
    p = p * 2.03 + vec2( 1.7, 9.2 );
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 d = normalize( vDir );
  float h = d.y;
  vec3 color = mix( uHorizon, uTop, pow( clamp( h, 0.0, 1.0 ), 0.5 ) );
  float sd = max( dot( d, normalize( uSunDir ) ), 0.0 );
  float sunUp = smoothstep( -0.08, 0.05, uSunDir.y );
  color += uSunColor * ( pow( sd, 1400.0 ) * 18.0 * sunUp * ( 1.0 - uCloud * 0.8 ) + pow( sd, 14.0 ) * 0.35 + pow( sd, 3.0 ) * 0.1 * sunUp );
  // Clouds on a virtual plane.
  vec2 cp = d.xz / max( h, 0.06 ) * 1.4 + vec2( uTime * 0.006, uTime * 0.002 );
  float c = fbm( cp );
  float cover = smoothstep( 1.0 - uCloud * 0.95, 1.0 - uCloud * 0.95 + 0.32, c ) * smoothstep( 0.0, 0.18, h );
  vec3 lit = mix( uHorizon * 1.1, uSunColor * 0.9 + uHorizon * 0.3, pow( sd, 4.0 ) * sunUp );
  vec3 cloudColor = mix( lit, uTop * 0.55, smoothstep( 0.45, 0.95, c ) * 0.6 );
  cloudColor = mix( cloudColor, vec3( 0.02, 0.03, 0.05 ), uNight * 0.75 );
  color = mix( color, cloudColor, cover * 0.85 );
  // Stars.
  vec3 sp = floor( d * 420.0 );
  float star = step( 0.9975, hash( sp ) ) * smoothstep( 0.06, 0.4, h ) * ( 1.0 - cover );
  color += vec3( star ) * uStars * 1.4;
  gl_FragColor = vec4( color, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // Same order as three's fog_fragment (after tone mapping), so the horizon meets fogged geometry seamlessly.
  gl_FragColor.rgb = mix( gl_FragColor.rgb, uFog, 1.0 - smoothstep( -0.03, 0.12, h ) );
}
`;

export function Sky() {
  const ref = useRef<Mesh>(null);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        side: BackSide,
        depthWrite: false,
        uniforms: {
          uTop: { value: new Color() },
          uHorizon: { value: new Color() },
          uFog: { value: new Color() },
          uSunDir: { value: new Vector3() },
          uSunColor: { value: new Color() },
          uStars: { value: 0 },
          uCloud: { value: 0 },
          uTime: { value: 0 },
          uNight: { value: 0 },
        },
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame((state) => {
    ref.current?.position.copy(state.camera.position);
    const u = material.uniforms;
    (u.uTop!.value as Color).copy(atmosphereFrame.top);
    (u.uHorizon!.value as Color).copy(atmosphereFrame.horizon);
    // three uploads fog colours in the output colour space (sRGB); match it.
    (u.uFog!.value as Color).copy(atmosphereFrame.fog).convertLinearToSRGB();
    (u.uSunDir!.value as Vector3).set(...atmosphereFrame.sunDirection);
    (u.uSunColor!.value as Color).copy(atmosphereFrame.sunColor);
    setUniform(material, 'uStars', atmosphereFrame.stars);
    setUniform(material, 'uCloud', atmosphereFrame.cloud);
    setUniform(material, 'uNight', atmosphereFrame.night);
    setUniform(material, 'uTime', state.clock.elapsedTime);
  });

  return (
    <mesh ref={ref} material={material} frustumCulled={false} renderOrder={2}>
      <sphereGeometry args={[900, 32, 16]} />
    </mesh>
  );
}
