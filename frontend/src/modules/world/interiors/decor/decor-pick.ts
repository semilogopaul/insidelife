import { Box3, Plane, Ray, Vector3 } from 'three';
import { pointInRect, type DecorRoom, type DecorWall, type OrientedRect } from '@insidelife/shared';
import type { PickBox } from './decor-scene';

/**
 * Pointer rays against the room, worked out by hand (no scene raycast): the floor, the two walls, the tops of tables
 * and beds, and the boxes pieces are picked by. Pure: the editor feeds it the camera's ray.
 */

const UP = new Vector3(0, 1, 0);
const tmp = new Vector3();

/** Where the ray meets the horizontal plane at height `y`, if it does in front of the camera. */
export function rayAtHeight(ray: Ray, y: number): { readonly x: number; readonly z: number } | null {
  const hit = ray.intersectPlane(new Plane(UP, -y), tmp);
  return hit ? { x: hit.x, z: hit.z } : null;
}

/** Where the ray meets the back or left wall, inside the wall's rectangle; the nearer one wins. */
export function rayWallPoint(ray: Ray, room: Pick<DecorRoom, 'width' | 'depth' | 'height'>): { readonly wall: DecorWall; readonly u: number; readonly y: number } | null {
  let best: { wall: DecorWall; u: number; y: number; t: number } | null = null;
  const planes: ReadonlyArray<readonly [DecorWall, Plane]> = [
    ['back', new Plane(new Vector3(0, 0, 1), room.depth / 2)],
    ['left', new Plane(new Vector3(1, 0, 0), room.width / 2)],
  ];
  for (const [wall, plane] of planes) {
    const hit = ray.intersectPlane(plane, new Vector3());
    if (!hit) continue;
    const u = wall === 'back' ? hit.x : hit.z;
    const length = wall === 'back' ? room.width : room.depth;
    if (Math.abs(u) > length / 2 + 0.3 || hit.y < -0.2 || hit.y > room.height + 0.3) continue;
    const t = ray.origin.distanceTo(hit);
    if (!best || t < best.t) best = { wall, u, y: hit.y, t };
  }
  return best ? { wall: best.wall, u: best.u, y: best.y } : null;
}

/** Distance along the ray to a turned box, or null. */
export function rayBoxDistance(ray: Ray, box: PickBox): number | null {
  const turn = (-box.rot * Math.PI) / 180;
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  const toLocal = (v: Vector3): Vector3 => {
    const x = v.x - box.position[0];
    const z = v.z - box.position[2];
    return new Vector3(x * c + z * s, v.y - box.position[1], -x * s + z * c);
  };
  const origin = toLocal(ray.origin);
  const far = toLocal(ray.origin.clone().add(ray.direction));
  const local = new Ray(origin, far.sub(origin).normalize());
  const half = new Vector3(box.size[0] / 2, box.size[1] / 2, box.size[2] / 2);
  const hit = local.intersectBox(new Box3(half.clone().negate(), half), new Vector3());
  return hit ? origin.distanceTo(hit) : null;
}

/** The nearest box the ray goes through. */
export function pickNearest(ray: Ray, boxes: readonly PickBox[]): PickBox | null {
  let best: PickBox | null = null;
  let bestDistance = Infinity;
  for (const box of boxes) {
    const distance = rayBoxDistance(ray, box);
    if (distance !== null && distance < bestDistance) {
      best = box;
      bestDistance = distance;
    }
  }
  return best;
}

/** The point on top of a surface (a rectangle at height `top`) under the ray, if the ray lands on it. */
export function rayOnSurface(ray: Ray, top: number, rect: OrientedRect): { readonly x: number; readonly z: number } | null {
  const point = rayAtHeight(ray, top);
  return point && pointInRect(point, rect, 0.04) ? point : null;
}
