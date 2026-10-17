import type { OrientedRect } from '@insidelife/shared';
import { furnitureFootprint, propFootprint } from '../walk/colliders';
import type { InteriorTemplate } from '../templates/types';

/** Something already standing in the room that decor must not go through: its floor rectangle and height. */
export interface Fixture {
  readonly rect: OrientedRect;
  readonly height: number;
}

/** Something hanging on a wall (clock, air-conditioner, sign): where, so art doesn't cover it. */
export interface WallMount {
  readonly wall: 'back' | 'left';
  /** Centre along the wall (x for the back wall, z for the left wall). */
  readonly u: number;
  readonly halfWidth: number;
  readonly y0: number;
  readonly y1: number;
}

/** The template's own furniture and props that take floor space (the same footprints the walker bumps into). */
export function fixturesOf(template: InteriorTemplate): Fixture[] {
  const list: Fixture[] = [];
  const add = (box: { minX: number; maxX: number; minZ: number; maxZ: number; height: number } | null): void => {
    if (!box) return;
    list.push({ rect: { x: (box.minX + box.maxX) / 2, z: (box.minZ + box.maxZ) / 2, w: box.maxX - box.minX, d: box.maxZ - box.minZ, rot: 0 }, height: box.height });
  };
  for (const piece of template.furniture) add(furnitureFootprint(piece));
  for (const prop of template.props) add(propFootprint(prop));
  return list;
}

/** Wall-mounted extents by prop kind: [width, height]. */
const MOUNT_SIZE: Readonly<Record<string, readonly [number, number]>> = {
  'wall-clock': [0.4, 0.4],
  aircon: [0.9, 0.3],
  'projector-screen': [2, 1.5],
};

/** Wall-hung props of the template, so decor stays off them. */
export function wallMountsOf(template: InteriorTemplate): WallMount[] {
  const { width, depth } = template.room;
  const list: WallMount[] = [];
  for (const prop of template.props) {
    const size = prop.kind === 'sign' && prop.wall ? prop.size : prop.kind === 'mirror' ? prop.size : (MOUNT_SIZE[prop.kind] as readonly [number, number] | undefined);
    if (!size || (prop.y ?? 0) <= 0.3) continue;
    const [w, h] = size;
    const y = prop.y ?? 0;
    const onBack = Math.abs(prop.at[1] + depth / 2) < 0.4;
    const onLeft = Math.abs(prop.at[0] + width / 2) < 0.4;
    if (!onBack && !onLeft) continue;
    list.push({ wall: onBack ? 'back' : 'left', u: onBack ? prop.at[0] : prop.at[1], halfWidth: w / 2, y0: y - h / 2, y1: y + h / 2 });
  }
  return list;
}
