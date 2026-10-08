import { CanvasTexture, Color, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';

/**
 * Soft contact shadows for crowds (pedestrians, other players) as one instanced draw: slots are placed or hidden
 * each frame by their owners. Avatars in the crowd render with their own blob off.
 */

const matrix = new Matrix4();
const HIDDEN = new Matrix4().makeScale(0, 0, 0);

function blobTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(0,0,0,0.5)');
    gradient.addColorStop(0.55, 'rgba(0,0,0,0.25)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export class BlobShadows {
  readonly mesh: InstancedMesh;
  private readonly texture: CanvasTexture;
  private readonly material: MeshBasicMaterial;
  private readonly geometry: PlaneGeometry;

  constructor(capacity: number) {
    this.texture = blobTexture();
    this.geometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.material = new MeshBasicMaterial({ map: this.texture, color: new Color(0xffffff), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false });
    this.mesh = new InstancedMesh(this.geometry, this.material, capacity);
    this.mesh.name = 'play-blob-shadows';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    for (let i = 0; i < capacity; i++) this.mesh.setMatrixAt(i, HIDDEN);
  }

  set(slot: number, x: number, y: number, z: number, size: number): void {
    if (slot >= this.mesh.count) return;
    matrix.makeScale(size, 1, size * 0.85).setPosition(x, y + 0.02, z);
    this.mesh.setMatrixAt(slot, matrix);
  }

  hide(slot: number): void {
    if (slot >= this.mesh.count) return;
    this.mesh.setMatrixAt(slot, HIDDEN);
  }

  commit(): void {
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
    this.mesh.dispose();
  }
}
