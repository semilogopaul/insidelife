import { normalizeRot, type DecorPose, type OrientedRect } from '@insidelife/shared';

/**
 * Where a tabletop piece ends up when the piece it sits on moves from `from` to `to` (plan rectangles): it keeps its
 * place on the surface, turning with it. `top` is the new surface height. Pure.
 */
export function carriedPose(from: OrientedRect, to: OrientedRect, child: DecorPose, top: number): DecorPose {
  const turn = ((to.rot - from.rot) * Math.PI) / 180;
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  const rx = child.x - from.x;
  const rz = child.z - from.z;
  return {
    x: Math.round((to.x + rx * c + rz * s) * 100) / 100,
    z: Math.round((to.z - rx * s + rz * c) * 100) / 100,
    y: Math.round(top * 100) / 100,
    rot: normalizeRot(child.rot + (to.rot - from.rot)),
    wall: null,
    onId: child.onId,
  };
}
