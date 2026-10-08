'use client';

import { useFrame } from '@react-three/fiber';
import { useImperativeHandle, useLayoutEffect, useMemo, useRef, type Ref } from 'react';
import { CanvasTexture, Color, DoubleSide, Euler, Matrix4, MeshStandardMaterial, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3, type InstancedMesh } from 'three';
import { createRng } from '@insidelife/shared';

export interface MoneyRainHandle {
  /** Throw `count` notes from `origin` (defaults to the component's origin). */
  burst(count?: number, origin?: readonly [number, number, number]): void;
}

export interface MoneyRainProps {
  /** Where notes are sprayed from (above the celebrant's head). */
  readonly origin?: readonly [number, number, number];
  /** Continuous spraying while true. */
  readonly active?: boolean;
  /** Notes per second while active. */
  readonly rate?: number;
  /** How far notes scatter (m). */
  readonly spread?: number;
  readonly ref?: Ref<MoneyRainHandle>;
}

const POOL = 160;
/** ₦1000 (brown-blue), ₦500 (blue-green), ₦200 (teal) — the notes people actually spray. */
const NOTE_TINTS = ['#e8c8a8', '#b8d4f0', '#bfe3d0'].map((hex) => new Color(hex));

function paintNote(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#f4f1e6';
    ctx.fillRect(0, 0, 128, 64);
    ctx.strokeStyle = '#6b5a45';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 120, 56);
    ctx.fillStyle = '#7d8c6a';
    ctx.beginPath();
    ctx.arc(40, 32, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3e3326';
    ctx.font = 'bold 22px Impact, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('₦', 112, 22);
    ctx.font = 'bold 16px Impact, sans-serif';
    ctx.fillText('NAIRA', 116, 46);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

interface RainState {
  readonly notes: Note[];
  cursor: number;
  carry: number;
  readonly rng: ReturnType<typeof createRng>;
  readonly matrix: Matrix4;
  readonly quaternion: Quaternion;
  readonly scale: Vector3;
}

function createRainState(): RainState {
  const notes: Note[] = Array.from({ length: POOL }, () => ({ alive: false, position: new Vector3(), velocity: new Vector3(), rotation: new Euler(), spin: new Vector3(), age: 0 }));
  return { notes, cursor: 0, carry: 0, rng: createRng('money-rain'), matrix: new Matrix4(), quaternion: new Quaternion(), scale: new Vector3() };
}

interface Note {
  alive: boolean;
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly rotation: Euler;
  readonly spin: Vector3;
  age: number;
}

/**
 * Owambe spraying: naira notes flutter down from above a celebrant. One instanced draw call; trigger with
 * `active` (continuous) or imperatively via `ref.burst()` (e.g. on a realtime `party:spray`).
 */
export function MoneyRain({ origin = [0, 2.2, 0], active = false, rate = 18, spread = 0.9, ref }: MoneyRainProps) {
  const mesh = useRef<InstancedMesh>(null);
  const resources = useMemo(() => {
    const geometry = new PlaneGeometry(0.16, 0.08);
    const texture = paintNote();
    const material = new MeshStandardMaterial({ map: texture, side: DoubleSide, roughness: 0.85 });
    return { geometry, texture, material };
  }, []);
  useLayoutEffect(
    () => () => {
      resources.geometry.dispose();
      resources.texture.dispose();
      resources.material.dispose();
    },
    [resources],
  );

  const stateRef = useRef<RainState | null>(null);
  const getState = (): RainState => {
    stateRef.current ??= createRainState();
    return stateRef.current;
  };

  const spawn = (at: readonly [number, number, number]): void => {
    const state = getState();
    const index = state.cursor;
    const note = state.notes[index]!;
    state.cursor = (state.cursor + 1) % POOL;
    const { rng } = state;
    note.alive = true;
    note.age = 0;
    note.position.set(at[0] + rng.float(-0.15, 0.15), at[1] + rng.float(-0.05, 0.1), at[2] + rng.float(-0.15, 0.15));
    note.velocity.set(rng.float(-spread, spread), rng.float(0.6, 1.4), rng.float(-spread, spread));
    note.rotation.set(rng.float(0, Math.PI), rng.float(0, Math.PI), rng.float(0, Math.PI));
    note.spin.set(rng.float(-6, 6), rng.float(-4, 4), rng.float(-6, 6));
  };

  useImperativeHandle(ref, () => ({
    burst: (count = 24, at = origin) => {
      for (let i = 0; i < count; i++) spawn(at);
    },
  }));

  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    for (let i = 0; i < POOL; i++) instanced.setColorAt(i, NOTE_TINTS[i % NOTE_TINTS.length]!);
  }, []);

  useFrame((_, rawDelta) => {
    const instanced = mesh.current;
    if (!instanced) return;
    const delta = Math.min(0.05, rawDelta);
    const state = getState();
    if (active) {
      state.carry += rate * delta;
      while (state.carry >= 1) {
        spawn(origin);
        state.carry -= 1;
      }
    }
    const { matrix, quaternion, scale } = state;
    state.notes.forEach((note, index) => {
      if (note.alive) {
        note.age += delta;
        // Paper physics: gravity, heavy drag, sideways flutter.
        note.velocity.y -= 3.2 * delta;
        note.velocity.multiplyScalar(1 - 1.6 * delta);
        note.position.addScaledVector(note.velocity, delta);
        note.position.x += Math.sin(note.age * 7 + index) * 0.25 * delta;
        note.rotation.x += note.spin.x * delta;
        note.rotation.y += note.spin.y * delta;
        note.rotation.z += note.spin.z * delta;
        if (note.position.y <= 0.012) {
          // Settle flat on the floor; fade out after a while.
          note.position.y = 0.012;
          note.rotation.set(-Math.PI / 2, 0, note.rotation.z);
          note.spin.set(0, 0, 0);
          note.velocity.set(0, 0, 0);
        }
        if (note.age > 9) note.alive = false;
      }
      quaternion.setFromEuler(note.rotation);
      scale.setScalar(note.alive ? 1 : 0);
      matrix.compose(note.position, quaternion, scale);
      instanced.setMatrixAt(index, matrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[resources.geometry, resources.material, POOL]} frustumCulled={false} />;
}
