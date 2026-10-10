import type { PerspectiveCamera } from 'three';

/** The street camera's lens (the world Canvas starts with it). Interiors change near/far/fov for their rooms. */
export const STREET_CAMERA = { fov: 50, near: 0.5, far: 2000 } as const;

/**
 * Give the street its lens back. An interior's dollhouse or walk camera leaves a short far plane (≈ 6× the room) and
 * its own fov on the shared camera; coming out (on foot, or put on a bus by the server) the city beyond a few dozen
 * metres would be clipped away.
 */
export function restoreStreetLens(camera: PerspectiveCamera): void {
  if (camera.near === STREET_CAMERA.near && camera.far === STREET_CAMERA.far && camera.fov === STREET_CAMERA.fov) return;
  camera.near = STREET_CAMERA.near;
  camera.far = STREET_CAMERA.far;
  camera.fov = STREET_CAMERA.fov;
  camera.updateProjectionMatrix();
}
