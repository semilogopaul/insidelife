import { CanvasTexture, MeshBasicMaterial, PlaneGeometry } from 'three';

/**
 * A soft contact shadow under each avatar (one tiny draw call, no shadow map). Geometry, texture and material are
 * shared module singletons that live for the session.
 */
let geometry: PlaneGeometry | null = null;
let material: MeshBasicMaterial | null = null;

export function blobShadowGeometry(): PlaneGeometry {
  if (!geometry) {
    geometry = new PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
  }
  return geometry;
}

export function blobShadowMaterial(): MeshBasicMaterial {
  if (!material) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(0,0,0,0.55)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.28)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    }
    material = new MeshBasicMaterial({ map: new CanvasTexture(canvas), transparent: true, depthWrite: false, toneMapped: false });
    material.name = 'avatar-blob-shadow';
  }
  return material;
}
