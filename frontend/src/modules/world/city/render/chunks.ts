import { CITY_MAP } from '@insidelife/shared';
import { Box3, Frustum, Matrix4, Vector3, type Camera } from 'three';

/**
 * 64 m chunks over the city. Once per frame the grid tests every chunk box against the camera frustum (with a
 * margin so off-screen shadow casters still cast) and measures its distance for LOD. Batches read the result and
 * only touch instances of chunks whose state changed.
 */

export const CHUNK_SIZE = 64;
const MIN_X = CITY_MAP.bounds.minX;
const MIN_Z = CITY_MAP.bounds.minZ;
export const CHUNK_COLS = Math.ceil((CITY_MAP.bounds.maxX - MIN_X) / CHUNK_SIZE);
export const CHUNK_ROWS = Math.ceil((CITY_MAP.bounds.maxZ - MIN_Z) / CHUNK_SIZE);
export const CHUNK_COUNT = CHUNK_COLS * CHUNK_ROWS;

export function chunkOf(x: number, z: number): number {
  const col = Math.min(CHUNK_COLS - 1, Math.max(0, Math.floor((x - MIN_X) / CHUNK_SIZE)));
  const row = Math.min(CHUNK_ROWS - 1, Math.max(0, Math.floor((z - MIN_Z) / CHUNK_SIZE)));
  return row * CHUNK_COLS + col;
}

/** 0 hidden, 1 full detail, 2 simplified. */
export type ChunkState = 0 | 1 | 2;

export interface ChunkSettings {
  readonly lodDistance: number;
  readonly cullDistance: number;
}

export class ChunkGrid {
  readonly states = new Uint8Array(CHUNK_COUNT);
  /** Incremented whenever any chunk state changes. */
  version = 0;
  private readonly boxes: Box3[] = [];
  private readonly frustum = new Frustum();
  private readonly matrix = new Matrix4();
  private readonly centre = new Vector3();
  private readonly cameraPosition = new Vector3();

  constructor() {
    for (let i = 0; i < CHUNK_COUNT; i++) {
      const col = i % CHUNK_COLS;
      const row = Math.floor(i / CHUNK_COLS);
      const minX = MIN_X + col * CHUNK_SIZE;
      const minZ = MIN_Z + row * CHUNK_SIZE;
      // Margin covers models overhanging their chunk and shadows cast into view.
      this.boxes.push(new Box3(new Vector3(minX - 24, -4, minZ - 24), new Vector3(minX + CHUNK_SIZE + 24, 80, minZ + CHUNK_SIZE + 24)));
    }
  }

  update(camera: Camera, settings: ChunkSettings): void {
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.matrix);
    camera.getWorldPosition(this.cameraPosition);
    let changed = false;
    for (let i = 0; i < CHUNK_COUNT; i++) {
      const box = this.boxes[i] as Box3;
      box.getCenter(this.centre);
      const dx = this.centre.x - this.cameraPosition.x;
      const dz = this.centre.z - this.cameraPosition.z;
      const distance = Math.max(0, Math.hypot(dx, dz) - CHUNK_SIZE * 0.6);
      let state: ChunkState = 0;
      if (distance < settings.cullDistance && this.frustum.intersectsBox(box)) state = distance > settings.lodDistance ? 2 : 1;
      if (this.states[i] !== state) {
        this.states[i] = state;
        changed = true;
      }
    }
    if (changed) this.version++;
  }
}
