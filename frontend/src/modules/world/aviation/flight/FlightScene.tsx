'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BoxGeometry, Color, InstancedMesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, SphereGeometry, Vector3, type FogExp2, type Group } from 'three';
import { createRng } from '@insidelife/shared';
import { Aircraft } from '../model/Aircraft';
import { AIRCRAFT_SPECS } from '../model/aircraft-spec';
import type { AircraftClass, AircraftLivery } from '../contract';
import { flightAt, flightDistance, flightProfile } from './flight-timeline';

export type FlightQuality = 'low' | 'high';

export interface FlightSceneProps {
  readonly cls: AircraftClass;
  readonly livery: AircraftLivery;
  /** Flight length. */
  readonly durationMs: number;
  /** `low` for phones: fewer buildings and clouds. Default: from the screen. */
  readonly quality?: FlightQuality;
  /** Fired once when the flight ends (not when it is skipped: the parent just unmounts the scene). */
  readonly onDone?: () => void;
  /** Seed for the city and clouds (previews pin it). */
  readonly seed?: number;
}

const SKY_GROUND = new Color('#bfe3ff');
const SKY_HIGH = new Color('#2f6fc2');
const HAZE = new Color('#cfe4f7');
const PLANE_LENGTH = 12;
const TILE = 520;
const GROUND_Y = -0.02;

/** A phone-class device (coarse pointer or narrow screen): fewer instances. */
export function defaultQuality(): FlightQuality {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'high';
  return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768 ? 'low' : 'high';
}

/**
 * The flight, as a scene for the game's one Canvas (or the dev page's): the aircraft takes off from a runway, climbs
 * out over the city, cruises among clouds and descends to land. The city is one instanced mesh that fades into haze as
 * you climb (fog, no transparency), clouds are one more; the ground scrolls under a plane that stays put. Nothing here
 * allocates per frame and no React state is touched in the frame loop. Render it as a direct child of the Canvas (it sets
 * the scene's sky and fog, and takes over the camera while mounted); nothing else of the world should be mounted with it.
 */
export function FlightScene({ cls, livery, durationMs, quality, onDone, seed = 7 }: FlightSceneProps) {
  const level = quality ?? defaultQuality();
  const profile = flightProfile(cls);
  const seconds = durationMs / 1000;
  const clock = useThree((state) => state.clock);
  const skyRef = useRef<Color>(null);
  const fogRef = useRef<FogExp2>(null);
  const planeRef = useRef<Group>(null);
  const groundRef = useRef<Group>(null);
  const cloudsRef = useRef<Group>(null);
  /** Clock time the flight began (set on mount). */
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = clock.elapsedTime;
  }, [clock]);
  const done = useRef(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const scale = PLANE_LENGTH / AIRCRAFT_SPECS[cls].length;
  // Where the wheels touch down on the runway, so the runway can be laid under it.
  const total = useMemo(() => flightDistance(1, cls, seconds), [cls, seconds]);
  const touchdown = useMemo(() => {
    const landing = flightProfile(cls).shares.landing;
    return flightDistance(1 - landing + landing * 0.45, cls, seconds);
  }, [cls, seconds]);
  const buildings = useMemo(() => buildCity(seed, level === 'low' ? 90 : 220, total + 600), [seed, level, total]);
  const clouds = useMemo(() => buildClouds(seed + 1, level === 'low' ? 24 : 56), [seed, level]);
  const runway = useMemo(() => ({ geometry: new BoxGeometry(1, 0.04, 1), material: new MeshStandardMaterial({ color: '#3a3f46', roughness: 0.95 }), stripe: new MeshBasicMaterial({ color: '#f5f5f0' }) }), []);
  const runways = useMemo(() => [{ start: -100, length: 360 }, { start: touchdown - 140, length: total - touchdown + 320 }] as const, [touchdown, total]);
  const dashes = useMemo(() => buildDashes(runways, runway.stripe, runway.geometry), [runways, runway]);
  useEffect(() => () => dashes.dispose(), [dashes]);
  const ground = useMemo(() => new MeshStandardMaterial({ color: '#9fb888', roughness: 1 }), []);
  const groundLength = total + 1400;
  const groundGeometry = useMemo(() => new BoxGeometry(2400, 0.02, groundLength), [groundLength]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!done.current) {
        done.current = true;
        onDoneRef.current?.();
      }
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs]);

  useEffect(
    () => () => {
      buildings.dispose();
      clouds.dispose();
      runway.geometry.dispose();
      runway.material.dispose();
      runway.stripe.dispose();
      ground.dispose();
      groundGeometry.dispose();
    },
    [buildings, clouds, runway, ground, groundGeometry],
  );

  const target = useMemo(() => new Vector3(), []);
  useFrame((state) => {
    const progress = Math.min(1, Math.max(0, (state.clock.elapsedTime - startedAt.current) / seconds));
    const flight = flightAt(progress, cls);
    const distance = flightDistance(progress, cls, seconds);
    const lift = flight.altitude * profile.cruise;

    // The plane stays put (pitching a little, banking gently); the world moves under it.
    const plane = planeRef.current;
    if (plane) {
      plane.rotation.x = -flight.pitch;
      plane.rotation.z = Math.sin(state.clock.elapsedTime * 0.7) * 0.03 * flight.altitude;
      plane.position.y = flight.altitude < 0.001 ? 0 : Math.sin(state.clock.elapsedTime * 1.3) * 0.08 * flight.altitude;
    }
    const world = groundRef.current;
    if (world) {
      world.position.y = -lift;
      world.position.z = -distance;
    }
    const sky = cloudsRef.current;
    if (sky) sky.position.z = -(distance % TILE);

    // Sky and haze: the city dissolves into haze as you climb, the sky deepens.
    skyRef.current?.copy(SKY_GROUND).lerp(SKY_HIGH, Math.min(1, flight.altitude * 0.9));
    const fog = fogRef.current;
    if (fog) {
      fog.color.copy(HAZE).lerp(SKY_HIGH, flight.altitude * 0.5);
      fog.density = 0.0009 + (1 - flight.city) * 0.0075 + flight.altitude * profile.cruise * 0.00001;
    }

    // A chase camera: behind and to the side, easing wider as it climbs.
    const sway = Math.sin(state.clock.elapsedTime * 0.5);
    state.camera.position.set(9 + flight.altitude * 3 + sway * 0.6, 3.2 + flight.altitude * 1.8, -15 - flight.altitude * 3);
    target.set(-1.2, 0.8 + flight.pitch * 3, 2);
    state.camera.lookAt(target);
  });

  return (
    <>
      <color ref={skyRef} attach="background" args={[SKY_GROUND.getHex()]} />
      <fogExp2 ref={fogRef} attach="fog" args={[HAZE.getHex(), 0.001]} />
      <ambientLight intensity={1.5} />
      <directionalLight position={[30, 60, -20]} intensity={2.4} />
      <group ref={planeRef} name="flight:plane">
        <Aircraft cls={cls} livery={livery} scale={scale} spin />
      </group>
      <group ref={groundRef} name="flight:ground">
        <mesh geometry={groundGeometry} material={ground} position={[0, GROUND_Y, groundLength / 2 - 500]} />
        {/* The take-off runway under the plane at the start; the landing runway where the wheels touch down. */}
        <Runway start={runways[0].start} length={runways[0].length} runway={runway} />
        <Runway start={runways[1].start} length={runways[1].length} runway={runway} />
        <primitive object={dashes} />
        <primitive object={buildings.mesh} />
      </group>
      <group ref={cloudsRef} name="flight:clouds">
        <primitive object={clouds.mesh} />
      </group>
    </>
  );
}

interface RunwayParts {
  readonly geometry: BoxGeometry;
  readonly material: MeshStandardMaterial;
  readonly stripe: MeshBasicMaterial;
}

/** A runway slab centred on the flight line, starting at `start` (ground-frame z). */
function Runway({ start, length, runway }: { readonly start: number; readonly length: number; readonly runway: RunwayParts }) {
  return <mesh geometry={runway.geometry} material={runway.material} scale={[26, 1, length]} position={[0, 0, start + length / 2]} />;
}

/** The dashed centre lines of every runway: one instanced mesh. */
function buildDashes(runways: ReadonlyArray<{ readonly start: number; readonly length: number }>, material: MeshBasicMaterial, geometry: BoxGeometry): InstancedMesh {
  const total = runways.reduce((sum, r) => sum + Math.floor(r.length / 24), 0);
  const mesh = new InstancedMesh(geometry, material, total);
  let index = 0;
  for (const runway of runways) {
    for (let i = 0; i < Math.floor(runway.length / 24); i++) {
      dummy.position.set(0, 0.03, runway.start + 12 + i * 24);
      dummy.scale.set(0.8, 1, 9);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index++, dummy.matrix);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

interface Instanced {
  readonly mesh: InstancedMesh;
  dispose(): void;
}

const dummy = new Object3D();
const tint = new Color();

/** The city: boxes of 12 to 60 m, thinned near the flight line, spread over the whole distance. */
function buildCity(seed: number, count: number, span: number): Instanced {
  const rng = createRng(seed);
  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshStandardMaterial({ roughness: 0.9 });
  const mesh = new InstancedMesh(geometry, material, count);
  const palette = ['#c8c2b4', '#a7adb4', '#d9b8a0', '#8e99a6', '#e2dccb', '#b4a08c'];
  for (let i = 0; i < count; i++) {
    const side = rng.next() < 0.5 ? -1 : 1;
    const x = side * (40 + rng.next() * 320);
    const z = -200 + rng.next() * span;
    const w = 14 + rng.next() * 34;
    const d = 14 + rng.next() * 34;
    const h = 8 + rng.next() * rng.next() * 90;
    dummy.position.set(x, h / 2, z);
    dummy.scale.set(w, h, d);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, tint.set(palette[Math.floor(rng.next() * palette.length)] as string));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  return {
    mesh,
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}

/** Clouds: flattened white lumps in a band round the plane, repeating every `TILE` so the scroll can wrap unseen. */
function buildClouds(seed: number, count: number): Instanced {
  const rng = createRng(seed);
  const geometry = new SphereGeometry(1, 8, 6);
  const material = new MeshBasicMaterial({ color: '#ffffff', fog: false });
  const copies = [-1, 0, 1] as const;
  const mesh = new InstancedMesh(geometry, material, count * 3 * copies.length);
  let index = 0;
  for (let c = 0; c < count; c++) {
    const side = rng.next() < 0.5 ? -1 : 1;
    const cx = side * (18 + rng.next() * 160);
    const cy = -6 + rng.next() * 46;
    const cz = rng.next() * TILE;
    const size = 8 + rng.next() * 18;
    for (let k = 0; k < 3; k++) {
      const jitter = (rng.next() - 0.5) * size;
      for (const copy of copies) {
        dummy.position.set(cx + (k - 1) * size * 0.9, cy + (k === 1 ? size * 0.2 : 0), cz + jitter + copy * TILE);
        dummy.scale.set(size * (k === 1 ? 1.3 : 1), size * 0.5, size * 0.9);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(index++, dummy.matrix);
      }
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return {
    mesh,
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
