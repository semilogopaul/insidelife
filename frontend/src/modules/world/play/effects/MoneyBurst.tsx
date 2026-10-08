'use client';

import { useFrame } from '@react-three/fiber';
import { useState } from 'react';
import { CanvasTexture, DoubleSide, Euler, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3 } from 'three';
import { useDisposeOnUnmount } from '../lib/use-dispose';

/**
 * A short burst of naira notes (party spray) at a point: one instanced draw; notes flutter up, sway and drift down.
 * Capacity is fixed and the oldest notes are recycled.
 */

const CAPACITY = 96;
const LIFE = 2.6;

function noteTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#3f8f4e';
    context.fillRect(0, 0, 128, 64);
    context.fillStyle = '#7cc58a';
    context.fillRect(6, 6, 116, 52);
    context.strokeStyle = '#d8b54a';
    context.lineWidth = 3;
    context.strokeRect(10, 10, 108, 44);
    context.fillStyle = '#2d6b39';
    context.font = 'bold 34px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('₦', 64, 34);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

const matrix = new Matrix4();
const quaternion = new Quaternion();
const euler = new Euler();
const position = new Vector3();
const scale = new Vector3(0.36, 0.18, 1);
const HIDDEN = new Matrix4().makeScale(0, 0, 0);

export interface MoneyBurstHandle {
  trigger(x: number, y: number, z: number, count: number): void;
}

/** Note particles: a struct-of-arrays pool driving one InstancedMesh. */
export class MoneyBurst implements MoneyBurstHandle {
  readonly mesh: InstancedMesh;
  private readonly texture = noteTexture();
  private readonly geometry = new PlaneGeometry(1, 1);
  private readonly material: MeshBasicMaterial;
  private readonly life = new Float32Array(CAPACITY);
  private readonly p = new Float32Array(CAPACITY * 3);
  private readonly v = new Float32Array(CAPACITY * 3);
  private readonly phase = new Float32Array(CAPACITY);
  private readonly spin = new Float32Array(CAPACITY);
  private cursor = 0;
  private seed = 0x2545f491;
  private alive = 0;

  constructor() {
    this.material = new MeshBasicMaterial({ map: this.texture, side: DoubleSide, transparent: true, alphaTest: 0.1 });
    this.mesh = new InstancedMesh(this.geometry, this.material, CAPACITY);
    this.mesh.name = 'play-money-burst';
    this.mesh.frustumCulled = false;
    for (let i = 0; i < CAPACITY; i++) this.mesh.setMatrixAt(i, HIDDEN);
  }

  private random(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  trigger(x: number, y: number, z: number, count: number): void {
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % CAPACITY;
      const angle = this.random() * Math.PI * 2;
      const out = 0.6 + this.random() * 1.8;
      this.life[i] = LIFE * (0.7 + this.random() * 0.3);
      this.p[i * 3] = x;
      this.p[i * 3 + 1] = y;
      this.p[i * 3 + 2] = z;
      this.v[i * 3] = Math.cos(angle) * out;
      this.v[i * 3 + 1] = 2.4 + this.random() * 2.6;
      this.v[i * 3 + 2] = Math.sin(angle) * out;
      this.spin[i] = (this.random() - 0.5) * 9;
      this.phase[i] = this.random() * 6;
    }
    this.alive = CAPACITY;
  }

  update(dt: number): void {
    if (this.alive === 0) return;
    let alive = 0;
    for (let i = 0; i < CAPACITY; i++) {
      const life = this.life[i] as number;
      if (life <= 0) continue;
      const next = life - dt;
      this.life[i] = next;
      if (next <= 0) {
        this.mesh.setMatrixAt(i, HIDDEN);
        continue;
      }
      alive++;
      const o = i * 3;
      const vx = (this.v[o] as number) * (1 - dt * 0.8);
      const vy = Math.max(-1.1, (this.v[o + 1] as number) - 6 * dt);
      const vz = (this.v[o + 2] as number) * (1 - dt * 0.8);
      this.v[o] = vx;
      this.v[o + 1] = vy;
      this.v[o + 2] = vz;
      const phase = (this.phase[i] as number) + dt * 4;
      this.phase[i] = phase;
      const x = (this.p[o] as number) + (vx + Math.sin(phase) * 0.4) * dt;
      const y = Math.max(0.25, (this.p[o + 1] as number) + vy * dt);
      const z = (this.p[o + 2] as number) + (vz + Math.cos(phase * 0.8) * 0.4) * dt;
      this.p[o] = x;
      this.p[o + 1] = y;
      this.p[o + 2] = z;
      quaternion.setFromEuler(euler.set(phase * 0.7, phase * (this.spin[i] as number) * 0.2, Math.sin(phase) * 0.8));
      this.mesh.setMatrixAt(i, matrix.compose(position.set(x, y, z), quaternion, scale));
    }
    this.alive = alive;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}

export function useMoneyBurst(): MoneyBurst {
  const [burst] = useState(() => new MoneyBurst());
  useDisposeOnUnmount(burst, () => burst.dispose());
  useFrame((_, delta) => burst.update(Math.min(delta, 0.05)));
  return burst;
}
