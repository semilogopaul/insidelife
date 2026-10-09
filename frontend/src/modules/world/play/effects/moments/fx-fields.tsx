'use client';

import { useFrame } from '@react-three/fiber';
import { createContext, useImperativeHandle, useLayoutEffect, useMemo, useRef, type Ref } from 'react';
import { AdditiveBlending, Color, DoubleSide, Euler, IcosahedronGeometry, Matrix4, MeshBasicMaterial, PlaneGeometry, Quaternion, Vector3, type InstancedMesh } from 'three';
import { createRng } from '@insidelife/shared';
import type { Vec3 } from './anchors';

export interface SparkOptions {
  /** Upward launch speed (m/s) and sideways spread. */
  readonly up?: number;
  readonly spread?: number;
  /** m/s² (sparks fall a little; champagne falls a lot). */
  readonly gravity?: number;
  /** Seconds. */
  readonly life?: number;
  readonly color?: string;
  readonly size?: number;
}

export interface SparkHandle {
  emit(count: number, origin: Vec3, options?: SparkOptions): void;
}

export interface ConfettiHandle {
  burst(count: number, origin: Vec3, spread?: number, up?: number): void;
}

/** The two shared pools every effect throws particles into (see `InteriorMoments`). */
export interface FxPools {
  readonly sparks: { readonly current: SparkHandle | null };
  readonly confetti: { readonly current: ConfettiHandle | null };
}

export const FxContext = createContext<FxPools>({ sparks: { current: null }, confetti: { current: null } });

interface Particle {
  alive: boolean;
  age: number;
  life: number;
  gravity: number;
  size: number;
  readonly position: Vector3;
  readonly velocity: Vector3;
}

const SPARK_POOL = 360;
const CONFETTI_POOL = 260;
const CONFETTI_COLORS = ['#f6b90b', '#0f8a4f', '#c8287a', '#2457d6', '#ffffff', '#e2412e'].map((hex) => new Color(hex));

function makeParticles(count: number): Particle[] {
  return Array.from({ length: count }, () => ({ alive: false, age: 0, life: 1, gravity: 0, size: 1, position: new Vector3(), velocity: new Vector3() }));
}

interface PoolState {
  cursor: number;
  /** Something is alive: simulate and draw. */
  awake: boolean;
  readonly rng: ReturnType<typeof createRng>;
  readonly matrix: Matrix4;
  readonly scale: Vector3;
  readonly q: Quaternion;
}

interface SparkState extends PoolState {
  readonly particles: Particle[];
  readonly color: Color;
}

interface Flake extends Particle {
  readonly rotation: Euler;
  readonly spin: Vector3;
}

interface ConfettiState extends PoolState {
  readonly flakes: Flake[];
}

const poolState = (seed: string): PoolState => ({ cursor: 0, awake: false, rng: createRng(seed), matrix: new Matrix4(), scale: new Vector3(), q: new Quaternion() });

const createSparkState = (): SparkState => ({ ...poolState('venue-sparks'), particles: makeParticles(SPARK_POOL), color: new Color() });

const createConfettiState = (): ConfettiState => ({
  ...poolState('venue-confetti'),
  flakes: makeParticles(CONFETTI_POOL).map((particle) => ({ ...particle, rotation: new Euler(), spin: new Vector3() })),
});

/** Sparkler sparks, firework gerbs and champagne droplets: tiny additive glints, one draw call. */
export function SparkField({ ref }: { readonly ref?: Ref<SparkHandle> }) {
  const mesh = useRef<InstancedMesh>(null);
  const resources = useMemo(
    () => ({
      geometry: new IcosahedronGeometry(0.016, 0),
      material: new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    }),
    [],
  );
  useLayoutEffect(
    () => () => {
      resources.geometry.dispose();
      resources.material.dispose();
    },
    [resources],
  );
  // Simulation state lives in a ref (mutated every frame, never rendered).
  const stateRef = useRef<SparkState | null>(null);
  const getState = (): SparkState => {
    stateRef.current ??= createSparkState();
    return stateRef.current;
  };

  useImperativeHandle(ref, () => ({
    emit: (count, origin, options = {}) => {
      const instanced = mesh.current;
      const state = getState();
      const { rng } = state;
      state.awake = true;
      if (instanced) instanced.visible = true;
      state.color.set(options.color ?? '#ffd27a');
      for (let i = 0; i < count; i++) {
        const index = state.cursor;
        state.cursor = (state.cursor + 1) % SPARK_POOL;
        const particle = state.particles[index]!;
        const spread = options.spread ?? 0.6;
        particle.alive = true;
        particle.age = 0;
        particle.life = (options.life ?? 0.7) * rng.float(0.6, 1.2);
        particle.gravity = options.gravity ?? 2;
        particle.size = (options.size ?? 1) * rng.float(0.7, 1.3);
        particle.position.set(origin[0], origin[1], origin[2]);
        particle.velocity.set(rng.float(-spread, spread), (options.up ?? 1.2) * rng.float(0.5, 1.2), rng.float(-spread, spread));
        instanced?.setColorAt(index, state.color);
      }
      if (instanced?.instanceColor) instanced.instanceColor.needsUpdate = true;
    },
  }));

  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    for (let i = 0; i < SPARK_POOL; i++) instanced.setColorAt(i, new Color('#ffd27a'));
  }, []);

  useFrame((_, raw) => {
    const instanced = mesh.current;
    const state = getState();
    // Idle (nothing alive): no matrix updates and no draw call.
    if (!instanced || !state.awake) return;
    const delta = Math.min(0.05, raw);
    const { matrix, scale, q } = state;
    let alive = 0;
    state.particles.forEach((particle, index) => {
      if (particle.alive) {
        particle.age += delta;
        particle.velocity.y -= particle.gravity * delta;
        particle.position.addScaledVector(particle.velocity, delta);
        if (particle.age >= particle.life || particle.position.y < 0) particle.alive = false;
        else alive++;
      }
      scale.setScalar(particle.alive ? particle.size * (1 - particle.age / particle.life) : 0);
      matrix.compose(particle.position, q, scale);
      instanced.setMatrixAt(index, matrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
    if (alive === 0) {
      state.awake = false;
      instanced.visible = false;
    }
  });

  return <instancedMesh ref={mesh} args={[resources.geometry, resources.material, SPARK_POOL]} frustumCulled={false} visible={false} />;
}

/** Confetti: paper flakes that flutter down and settle on the floor, one draw call. */
export function ConfettiField({ ref }: { readonly ref?: Ref<ConfettiHandle> }) {
  const mesh = useRef<InstancedMesh>(null);
  const resources = useMemo(() => ({ geometry: new PlaneGeometry(0.06, 0.03), material: new MeshBasicMaterial({ side: DoubleSide, toneMapped: false }) }), []);
  useLayoutEffect(
    () => () => {
      resources.geometry.dispose();
      resources.material.dispose();
    },
    [resources],
  );
  const stateRef = useRef<ConfettiState | null>(null);
  const getState = (): ConfettiState => {
    stateRef.current ??= createConfettiState();
    return stateRef.current;
  };

  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    for (let i = 0; i < CONFETTI_POOL; i++) instanced.setColorAt(i, CONFETTI_COLORS[i % CONFETTI_COLORS.length]!);
  }, []);

  useImperativeHandle(ref, () => ({
    burst: (count, origin, spread = 1.4, up = 3) => {
      const state = getState();
      const { rng } = state;
      state.awake = true;
      if (mesh.current) mesh.current.visible = true;
      for (let i = 0; i < count; i++) {
        const flake = state.flakes[state.cursor]!;
        state.cursor = (state.cursor + 1) % CONFETTI_POOL;
        flake.alive = true;
        flake.age = 0;
        flake.life = rng.float(5, 8);
        flake.position.set(origin[0], origin[1], origin[2]);
        flake.velocity.set(rng.float(-spread, spread), up * rng.float(0.6, 1.2), rng.float(-spread, spread));
        flake.rotation.set(rng.float(0, Math.PI), rng.float(0, Math.PI), rng.float(0, Math.PI));
        flake.spin.set(rng.float(-8, 8), rng.float(-6, 6), rng.float(-8, 8));
      }
    },
  }));

  useFrame((_, raw) => {
    const instanced = mesh.current;
    const state = getState();
    if (!instanced || !state.awake) return;
    const delta = Math.min(0.05, raw);
    const { matrix, scale, q } = state;
    let alive = 0;
    state.flakes.forEach((flake, index) => {
      if (flake.alive) {
        flake.age += delta;
        flake.velocity.y -= 3 * delta;
        flake.velocity.multiplyScalar(1 - 1.8 * delta);
        flake.position.addScaledVector(flake.velocity, delta);
        flake.position.x += Math.sin(flake.age * 6 + index) * 0.3 * delta;
        if (flake.position.y <= 0.01) {
          flake.position.y = 0.01;
          flake.rotation.set(-Math.PI / 2, 0, flake.rotation.z);
          flake.velocity.set(0, 0, 0);
          flake.spin.set(0, 0, 0);
        } else {
          flake.rotation.x += flake.spin.x * delta;
          flake.rotation.y += flake.spin.y * delta;
          flake.rotation.z += flake.spin.z * delta;
        }
        if (flake.age > flake.life) flake.alive = false;
        else alive++;
      }
      q.setFromEuler(flake.rotation);
      scale.setScalar(flake.alive ? 1 : 0);
      matrix.compose(flake.position, q, scale);
      instanced.setMatrixAt(index, matrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
    if (alive === 0) {
      state.awake = false;
      instanced.visible = false;
    }
  });

  return <instancedMesh ref={mesh} args={[resources.geometry, resources.material, CONFETTI_POOL]} frustumCulled={false} visible={false} />;
}
