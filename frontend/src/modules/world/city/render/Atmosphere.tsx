'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Color, DirectionalLight, Fog, HemisphereLight, Object3D, PMREMGenerator, Vector3, type Camera, type Scene, type WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { livePose, livePoseFresh } from '../../navigation/live-pose';
import { computeAtmosphere } from '../lib/atmosphere';
import { atmosphereFrame } from '../lib/atmosphere-frame';
import type { QualityProfile } from '../lib/quality';
import { worldHour, worldWeather } from '../lib/world-time';
import { cityUniforms } from '../materials/city-materials';
import { setProps } from '../lib/mutate';

/**
 * Lighting rig driven by the game clock and weather: one shadow-casting key light (sun or moon) whose tight shadow
 * frustum follows the player, a hemisphere fill, a PMREM room environment for reflections, linear fog matched to the
 * horizon, ACES exposure per time of day, and the shared material uniforms (night windows, wet streets).
 */

const LAGOON_DAY = new Color('#2f6560');
const LAGOON_NIGHT = new Color('#0b1a22');
const OCEAN_DAY = new Color('#1c6280');
const OCEAN_NIGHT = new Color('#08151f');
const SHALLOW_DAY = new Color('#5aa394');
const SHALLOW_NIGHT = new Color('#123038');
const HAZE_WATER = new Color('#8a8a6a');

const focus = new Vector3();
const forward = new Vector3();
const lightOffset = new Vector3();

/** Where shadows should be sharp: the player, or the ground point the camera looks at. */
function focusPoint(camera: Camera, target: Vector3): Vector3 {
  if (livePoseFresh()) return target.set(livePose.x, 0, livePose.z);
  camera.getWorldDirection(forward);
  const t = forward.y < -0.05 ? Math.min(140, camera.position.y / -forward.y) : 60;
  return target.set(camera.position.x + forward.x * t, 0, camera.position.z + forward.z * t);
}

interface Rig {
  readonly key: DirectionalLight;
  readonly target: Object3D;
  readonly hemi: HemisphereLight;
}

function createRig(shadows: boolean): Rig {
  const key = new DirectionalLight('#ffffff', 2);
  key.castShadow = shadows;
  const target = new Object3D();
  key.target = target;
  return { key, target, hemi: new HemisphereLight('#bcd6ef', '#7d6448', 0.8) };
}

/** Tight shadow frustum around the focus; resizing drops the old map so three reallocates it. */
function configureShadow(key: DirectionalLight, quality: QualityProfile): void {
  const extent = quality.tier === 'high' ? 80 : 62;
  const { shadow } = key;
  shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
  setProps(shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 10, far: 520 });
  shadow.camera.updateProjectionMatrix();
  shadow.map?.dispose();
  setProps(shadow, { bias: -0.0004, normalBias: 0.5, map: null });
}

/** PMREM room environment for reflections + linear fog; returns the cleanup. */
function installEnvironment(gl: WebGLRenderer, scene: Scene, fogFar: number): () => void {
  const pmrem = new PMREMGenerator(gl);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04).texture;
  setProps(scene, { environment, fog: new Fog('#d8e7ee', 120, fogFar) });
  room.dispose();
  pmrem.dispose();
  return () => {
    setProps(scene, { environment: null, fog: null });
    environment.dispose();
  };
}

/** Writes this frame's atmosphere into the shared frame object, material uniforms, lights, fog and exposure. */
function applyAtmosphere(rig: Rig, gl: WebGLRenderer, scene: Scene, camera: Camera, elapsed: number, delta: number, quality: QualityProfile): void {
  const atmosphere = computeAtmosphere(worldHour(), worldWeather(), { far: quality.fogFar });
  const frame = atmosphereFrame;
  frame.sunDirection.splice(0, 3, ...atmosphere.sunDirection);
  frame.lightDirection.splice(0, 3, ...atmosphere.lightDirection);
  frame.sunColor.setHex(atmosphere.sunColor);
  frame.top.setHex(atmosphere.skyTop);
  frame.horizon.setHex(atmosphere.skyHorizon);
  frame.fog.setHex(atmosphere.fogColor);
  frame.lagoon.copy(LAGOON_DAY).lerp(LAGOON_NIGHT, atmosphere.night).lerp(HAZE_WATER, atmosphere.haze * 0.35);
  frame.ocean.copy(OCEAN_DAY).lerp(OCEAN_NIGHT, atmosphere.night).lerp(HAZE_WATER, atmosphere.haze * 0.25);
  frame.shallow.copy(SHALLOW_DAY).lerp(SHALLOW_NIGHT, atmosphere.night);
  if (atmosphere.rain > 0) {
    frame.lagoon.multiplyScalar(0.8);
    frame.ocean.multiplyScalar(0.8);
  }
  // Ease weather so storms roll in rather than snap (the first frame snaps).
  const ease = elapsed < 0.5 ? 1 : 1 - Math.exp(-Math.min(delta, 0.1) * 1.5);
  frame.rain += (atmosphere.rain - frame.rain) * ease;
  frame.wet += (atmosphere.wet - frame.wet) * ease * 0.5;
  frame.cloud += (atmosphere.cloud - frame.cloud) * ease;
  frame.haze += (atmosphere.haze - frame.haze) * ease;
  frame.night = atmosphere.night;
  frame.stars = atmosphere.stars;

  cityUniforms.uIlNight.value = atmosphere.night;
  cityUniforms.uIlWet.value = frame.wet;
  cityUniforms.uIlTime.value = elapsed;

  const { key, target, hemi } = rig;
  key.color.setHex(atmosphere.lightColor);
  hemi.color.setHex(atmosphere.hemiSky);
  hemi.groundColor.setHex(atmosphere.hemiGround);
  setProps(key, { intensity: atmosphere.lightIntensity });
  setProps(hemi, { intensity: atmosphere.hemiIntensity });
  setProps(scene, { environmentIntensity: atmosphere.envIntensity });
  setProps(gl, { toneMappingExposure: atmosphere.exposure });
  if (scene.fog instanceof Fog) {
    scene.fog.color.setHex(atmosphere.fogColor);
    setProps(scene.fog, { near: atmosphere.fogNear, far: atmosphere.fogFar });
  }

  // Shadow frustum follows the focus, snapped to shadow texels to avoid shimmering.
  focusPoint(camera, focus);
  const texel = (key.shadow.camera.right * 2) / key.shadow.mapSize.x;
  focus.set(Math.round(focus.x / texel) * texel, 0, Math.round(focus.z / texel) * texel);
  lightOffset.set(atmosphere.lightDirection[0], atmosphere.lightDirection[1], atmosphere.lightDirection[2]).multiplyScalar(260);
  key.position.copy(focus).add(lightOffset);
  target.position.copy(focus);
  target.updateMatrixWorld();
}

export function Atmosphere({ quality }: { readonly quality: QualityProfile }) {
  const { gl, scene } = useThree();
  const rig = useMemo(() => createRig(quality.shadows), [quality.shadows]);
  useEffect(() => configureShadow(rig.key, quality), [rig, quality]);
  useEffect(() => installEnvironment(gl, scene, quality.fogFar), [gl, scene, quality.fogFar]);
  useEffect(() => () => rig.key.dispose(), [rig]);
  useFrame((state, delta) => applyAtmosphere(rig, state.gl, state.scene, state.camera, state.clock.elapsedTime, delta, quality), -2);

  return (
    <>
      <primitive object={rig.key} />
      <primitive object={rig.target} />
      <primitive object={rig.hemi} />
    </>
  );
}
