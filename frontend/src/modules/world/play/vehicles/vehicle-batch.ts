import { BatchedMesh, Color, Matrix4, Quaternion, Vector3 } from 'three';
import { yawFromHeading } from '../physics/math';
import { vehicleScale, type RenderVehicleModel, type VehicleKit } from './vehicle-kit';

/**
 * Every moving vehicle that isn't the player's own car — traffic, other players' cars — in one BatchedMesh with the
 * shared kit material: one draw call (plus one in the shadow pass) however many are on screen. Slots are fixed;
 * callers place or hide them each frame. Allocation-free per frame.
 */

const UP = new Vector3(0, 1, 0);
const position = new Vector3();
const quaternion = new Quaternion();
const scale = new Vector3();
const matrix = new Matrix4();
const color = new Color();

export class VehicleBatch {
  readonly mesh: BatchedMesh;
  readonly slots: number;
  private readonly geometryIds = new Map<RenderVehicleModel, number>();
  private readonly instance: Int32Array;
  private readonly geometryOf: Int32Array;
  private readonly tintOf: Uint32Array;
  private readonly shown: Uint8Array;

  constructor(kit: VehicleKit, slots: number) {
    this.slots = slots;
    let vertices = 0;
    let indices = 0;
    for (const geometry of kit.geometries.values()) {
      vertices += geometry.getAttribute('position').count;
      indices += geometry.getIndex()?.count ?? 0;
    }
    const mesh = new BatchedMesh(slots, vertices, indices, kit.material);
    mesh.name = 'play-vehicles';
    mesh.frustumCulled = false;
    mesh.perObjectFrustumCulled = true;
    mesh.sortObjects = false;
    for (const [model, geometry] of kit.geometries) this.geometryIds.set(model, mesh.addGeometry(geometry));
    const first = this.geometryIds.values().next().value ?? 0;
    this.instance = new Int32Array(slots);
    this.geometryOf = new Int32Array(slots).fill(first);
    this.tintOf = new Uint32Array(slots).fill(0xffffff);
    this.shown = new Uint8Array(slots);
    for (let i = 0; i < slots; i++) {
      const id = mesh.addInstance(first);
      mesh.setColorAt(id, color.setHex(0xffffff));
      mesh.setVisibleAt(id, false);
      this.instance[i] = id;
    }
    this.mesh = mesh;
  }

  set(slot: number, model: RenderVehicleModel, x: number, y: number, z: number, heading: number, tint = 0xffffff): void {
    if (slot < 0 || slot >= this.slots) return;
    const id = this.instance[slot] as number;
    const geometry = this.geometryIds.get(model);
    if (geometry === undefined) return;
    if (this.geometryOf[slot] !== geometry) {
      this.mesh.setGeometryIdAt(id, geometry);
      this.geometryOf[slot] = geometry;
    }
    if (this.tintOf[slot] !== tint) {
      this.mesh.setColorAt(id, color.setHex(tint));
      this.tintOf[slot] = tint;
    }
    position.set(x, y, z);
    quaternion.setFromAxisAngle(UP, yawFromHeading(heading));
    scale.setScalar(vehicleScale(model));
    this.mesh.setMatrixAt(id, matrix.compose(position, quaternion, scale));
    if (!this.shown[slot]) {
      this.mesh.setVisibleAt(id, true);
      this.shown[slot] = 1;
    }
  }

  hide(slot: number): void {
    if (slot < 0 || slot >= this.slots || !this.shown[slot]) return;
    this.mesh.setVisibleAt(this.instance[slot] as number, false);
    this.shown[slot] = 0;
  }

  dispose(): void {
    this.mesh.dispose();
  }
}
