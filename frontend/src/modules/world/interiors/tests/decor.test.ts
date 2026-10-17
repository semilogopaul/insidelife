import type { Box3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  DECOR_HOME_ROOMS,
  DECOR_ITEMS,
  checkDecorPlacement,
  decorRect,
  findDecorItem,
  wallPose,
  type DecorPose,
  type DecorRoom,
  type PlacedDecor,
} from '@insidelife/shared';
import { resolveDrop, type DropContext } from '../decor/decor-drop';
import { rayAtHeight, rayBoxDistance, rayOnSurface, rayWallPoint, pickNearest } from '../decor/decor-pick';
import { buildDecorGeometry, buildGhostGeometry, pickBoxOf, withDecorColliders } from '../decor/decor-scene';
import { fixturesOf, wallMountsOf } from '../decor/fixtures';
import { HOME_LAYOUTS } from '../layouts/catalog';
import { propFootprint, roomColliders } from '../walk/colliders';
import { Ray, Vector3 } from 'three';

const floorPose = (x: number, z: number, rot = 0): DecorPose => ({ x, z, y: 0, rot, wall: null, onId: null });
const living: DecorRoom = DECOR_HOME_ROOMS['home-flat'].living;
const item = (id: string) => findDecorItem(id)!;
const placed = (id: string, itemId: string, pose: DecorPose): PlacedDecor => ({ id, itemId, pose });
const context = (over: Partial<DropContext> & { itemId: string }): DropContext => ({
  room: living,
  item: item(over.itemId),
  others: [],
  fixtures: [],
  mounts: [],
  rot: 0,
  autoFace: false,
  ...over,
});

describe('decor room table', () => {
  it('matches the 3D templates it validates placements for (size, doors, windows, stairs)', () => {
    for (const [templateId, rooms] of Object.entries(DECOR_HOME_ROOMS)) {
      const layout = HOME_LAYOUTS[templateId as keyof typeof HOME_LAYOUTS];
      expect(layout, templateId).toBeDefined();
      expect(Object.keys(rooms).toSorted(), templateId).toEqual(layout.rooms.map((room) => room.id).toSorted());
      for (const layoutRoom of layout.rooms) {
        const table: DecorRoom = (rooms as Record<string, DecorRoom>)[layoutRoom.id]!;
        const spec = layoutRoom.template.room;
        const where = `${templateId}/${layoutRoom.id}`;
        expect([table.width, table.depth, table.height], where).toEqual([spec.width, spec.depth, spec.height]);
        expect(table.doors.map((door) => [door.wall, door.at, door.width]), where).toEqual((spec.doors ?? []).map((door) => [door.wall, door.at, door.width]));
        expect(table.windows.map((w) => [w.wall, w.at, w.width, w.sill, w.height]), where).toEqual(
          (spec.windows ?? []).map((w) => [w.wall, w.at, w.width, w.sill ?? 0.85, w.height ?? 1.05]),
        );
        const stairs = layoutRoom.template.props.filter((prop) => prop.kind === 'stairs' || prop.kind === 'stairwell').flatMap((prop) => {
          const box = propFootprint(prop);
          return box ? [{ minX: +box.minX.toFixed(2), maxX: +box.maxX.toFixed(2), minZ: +box.minZ.toFixed(2), maxZ: +box.maxZ.toFixed(2) }] : [];
        });
        expect(table.keepOut, where).toEqual(stairs);
      }
    }
  });
});

describe('decor models', () => {
  const room = DECOR_HOME_ROOMS['home-mansion'].master;

  it.each(DECOR_ITEMS)('draws $name in every finish within its footprint and height', (entry) => {
    const pose: DecorPose =
      entry.placement === 'wall' ? wallPose(room, 'back', 0, entry.hangAt ?? 1.2) : { x: 0, z: 0, y: 0, rot: 0, wall: null, onId: null };
    for (const variant of entry.variants) {
      const geometry = buildDecorGeometry([{ id: 'piece-1', item: entry, variant, pose }]);
      expect(geometry, `${entry.id}/${variant.id}`).not.toBeNull();
      geometry!.computeBoundingBox();
      const box: Box3 = geometry!.boundingBox!;
      const [w, d] = entry.footprint;
      // Recipes are drawn within their catalog footprint (a little slack for fronds, rims and fringes).
      const slack = 0.16;
      if (entry.placement === 'wall') {
        expect(box.min.x, entry.id).toBeGreaterThanOrEqual(pose.x - w / 2 - slack);
        expect(box.max.x, entry.id).toBeLessThanOrEqual(pose.x + w / 2 + slack);
        expect(box.min.z, entry.id).toBeGreaterThanOrEqual(pose.z - 0.02);
        expect(box.max.z, entry.id).toBeLessThanOrEqual(pose.z + d + slack);
        expect(box.min.y, entry.id).toBeGreaterThanOrEqual(pose.y - 0.05);
        expect(box.max.y, entry.id).toBeLessThanOrEqual(pose.y + entry.height + 0.05);
      } else {
        expect(box.max.x - box.min.x, entry.id).toBeLessThanOrEqual(w + slack * 2);
        expect(box.max.z - box.min.z, entry.id).toBeLessThanOrEqual(d + slack * 2);
        expect(box.min.y, entry.id).toBeGreaterThanOrEqual(-0.01);
        expect(box.max.y, entry.id).toBeLessThanOrEqual(entry.height + 0.08);
        expect(box.max.y, entry.id).toBeGreaterThan(entry.height * 0.5);
      }
      geometry!.dispose();
    }
  });

  it('puts pieces where the pose says, turned and lifted', () => {
    const rug = item('rug-persian');
    const geometry = buildDecorGeometry([{ id: 'r', item: rug, variant: rug.variants[0]!, pose: { x: 2, z: -1, y: 0, rot: 90, wall: null, onId: null } }])!;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    // A 2.4 × 1.7 rug turned a quarter: 1.7 wide, 2.4 deep, centred on (2, -1).
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(2, 1);
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(-1, 1);
    expect(box.max.z - box.min.z).toBeGreaterThan(box.max.x - box.min.x);
    const vase = item('flowers-vase');
    const lifted = buildDecorGeometry([{ id: 'v', item: vase, variant: vase.variants[0]!, pose: { x: 0, z: 0, y: 0.8, rot: 0, wall: null, onId: 't' } }])!;
    lifted.computeBoundingBox();
    expect(lifted.boundingBox!.min.y).toBeCloseTo(0.8, 1);
  });

  it('draws nothing for an empty room, and a ghost at the origin', () => {
    expect(buildDecorGeometry([])).toBeNull();
    const sofaTable = item('table-coffee-marble');
    const ghost = buildGhostGeometry(sofaTable, sofaTable.variants[0]!)!;
    ghost.computeBoundingBox();
    expect((ghost.boundingBox!.min.x + ghost.boundingBox!.max.x) / 2).toBeCloseTo(0, 1);
  });

  it('is deterministic (same pieces, same geometry)', () => {
    const plant = item('plant-areca-palm');
    const make = () => buildDecorGeometry([{ id: 'p1', item: plant, variant: plant.variants[0]!, pose: floorPose(0, 0) }])!.getAttribute('position').array;
    expect([...make()]).toEqual([...make()]);
  });
});

describe('dropping a piece', () => {
  it('snaps flush to the walls and to the grid, and turns oriented pieces to face the room', () => {
    const table = resolveDrop(context({ itemId: 'table-console', autoFace: true }), { kind: 'floor', x: -2.2, z: -2.45 });
    expect(table).toMatchObject({ ok: true, pose: { rot: 0 } });
    expect(table.pose.z).toBeCloseTo(-2.7 + 0.175, 1);
    const left = resolveDrop(context({ itemId: 'table-console', autoFace: true }), { kind: 'floor', x: -3.1, z: 1 });
    expect(left.pose.rot).toBe(90);
    expect(left.pose.x).toBeCloseTo(-3.3 + 0.175, 1);
    const free = resolveDrop(context({ itemId: 'plant-snake' }), { kind: 'floor', x: 0.512, z: 0.61 });
    expect(free).toMatchObject({ ok: true, pose: { x: 0.5, z: 0.6 } });
  });

  it('keeps a piece inside the room however far the pointer goes', () => {
    const drop = resolveDrop(context({ itemId: 'bed-divan-queen' }), { kind: 'floor', x: 40, z: 40 });
    expect(drop.pose.x).toBeLessThanOrEqual(3.3);
    expect(drop.pose.z).toBeLessThanOrEqual(2.7 + 0.01);
    expect(checkDecorPlacement(living, item('bed-divan-queen'), drop.pose, [])).toMatchObject({ ok: true });
  });

  it('says why not: doors, stairs, other pieces and the room’s own furniture', () => {
    expect(resolveDrop(context({ itemId: 'table-console' }), { kind: 'floor', x: 2.4, z: -2.5 })).toMatchObject({ ok: false });
    const duplex = DECOR_HOME_ROOMS['home-duplex'].living;
    expect(resolveDrop(context({ itemId: 'plant-areca-palm', room: duplex }), { kind: 'floor', x: -2.5, z: -2.6 })).toMatchObject({ ok: false, reason: expect.stringContaining('stairs') });
    const bed = placed('b', 'bed-divan-queen', floorPose(0, 0));
    expect(resolveDrop(context({ itemId: 'table-coffee-marble', others: [bed] }), { kind: 'floor', x: 0.2, z: 0.2 })).toMatchObject({ ok: false });
    const sofa = { rect: { x: 1, z: 0, w: 2, d: 1, rot: 0 }, height: 0.9 };
    const blocked = resolveDrop(context({ itemId: 'table-coffee-marble', fixtures: [sofa] }), { kind: 'floor', x: 1, z: 0 });
    expect(blocked).toMatchObject({ ok: false, reason: 'That’s in the way of the furniture.' });
    // Rugs lie under furniture.
    expect(resolveDrop(context({ itemId: 'rug-persian', fixtures: [sofa] }), { kind: 'floor', x: 1, z: 0 })).toMatchObject({ ok: true });
  });

  it('snaps edge to edge against a neighbour', () => {
    const first = placed('a', 'table-coffee-marble', floorPose(0, 0)); // 1.1 × 0.6
    const next = resolveDrop(context({ itemId: 'table-coffee-marble', others: [first] }), { kind: 'floor', x: 1.2, z: 0.05 });
    expect(next.ok).toBe(true);
    expect(next.pose.x).toBeCloseTo(1.1, 2);
  });

  it('hangs wall pieces where the pointer is, clear of doors, windows and fittings', () => {
    const print = item('art-print-framed');
    const ok = resolveDrop(context({ itemId: 'art-print-framed' }), { kind: 'wall', wall: 'back', u: -2.4, y: 1.6 });
    expect(ok).toMatchObject({ ok: true, pose: { x: -2.4, z: -2.7, y: 1.2, wall: 'back' } });
    expect(resolveDrop(context({ itemId: 'art-print-framed' }), { kind: 'wall', wall: 'back', u: 1.05, y: 1.5 })).toMatchObject({ ok: false, reason: 'That would cover the window.' });
    expect(resolveDrop(context({ itemId: 'art-print-framed' }), { kind: 'wall', wall: 'back', u: 2.4, y: 1.5 })).toMatchObject({ ok: false });
    const clock = [{ wall: 'back' as const, u: -2.4, halfWidth: 0.2, y0: 1.0, y1: 1.4 }];
    expect(resolveDrop(context({ itemId: 'art-print-framed', mounts: clock }), { kind: 'wall', wall: 'back', u: -2.4, y: 1.3 })).toMatchObject({ ok: false, reason: 'That’s over something on the wall.' });
    // Dragged off the wall onto the floor, it slides onto the nearest wall instead of failing.
    const slid = resolveDrop(context({ itemId: 'art-print-framed' }), { kind: 'floor', x: -2, z: -1 });
    expect(slid.pose.wall).not.toBeNull();
    // And a floor piece is refused on a wall.
    expect(resolveDrop(context({ itemId: 'table-console' }), { kind: 'wall', wall: 'back', u: -2, y: 1 })).toMatchObject({ ok: false });
    void print;
  });

  it('puts tabletop pieces on the surface under the pointer, pulled inside its edge', () => {
    const table = placed('t', 'table-console', floorPose(-2.2, -2.5));
    const onTable = resolveDrop(context({ itemId: 'flowers-vase', others: [table] }), { kind: 'surface', parentId: 't', x: -2.9, z: -2.5 });
    expect(onTable).toMatchObject({ ok: true, pose: { onId: 't', y: 0.8 } });
    expect(onTable.pose.x).toBeGreaterThan(-2.8);
    // With no surface under it, a tabletop piece asks for one.
    expect(resolveDrop(context({ itemId: 'flowers-vase', others: [table] }), { kind: 'floor', x: 0, z: 0 })).toMatchObject({ ok: false, reason: 'Put it on a table, bed or shelf.' });
    expect(resolveDrop(context({ itemId: 'rug-persian', others: [table] }), { kind: 'surface', parentId: 't', x: -2.2, z: -2.5 })).toMatchObject({ ok: false });
  });
});

describe('picking', () => {
  const down = (from: [number, number, number], to: [number, number, number]) => new Ray(new Vector3(...from), new Vector3(...to).sub(new Vector3(...from)).normalize());

  it('finds the floor, the walls and the tops of tables under a ray', () => {
    const ray = down([2, 4, 4], [0, 0, 0]);
    const floor = rayAtHeight(ray, 0)!;
    expect(floor.x).toBeCloseTo(0);
    expect(floor.z).toBeCloseTo(0);
    expect(rayAtHeight(down([0, 2, 0], [1, 3, 0]), 0)).toBeNull();
    const wall = rayWallPoint(down([0, 1.5, 6], [1, 1.2, -2.7]), living)!;
    expect(wall).toMatchObject({ wall: 'back' });
    expect(wall.u).toBeCloseTo(1, 1);
    expect(wall.y).toBeCloseTo(1.2, 1);
    const left = rayWallPoint(down([6, 1.5, 0], [-3.3, 1.2, 1]), living)!;
    expect(left.wall).toBe('left');
    expect(left.u).toBeCloseTo(1, 1);
    const table = decorRect(living, item('table-console'), floorPose(-2.2, -2.5));
    expect(rayOnSurface(down([-2.2, 3, 2], [-2.2, 0.8, -2.5]), 0.8, table)).not.toBeNull();
    expect(rayOnSurface(down([0, 3, 2], [0, 0.8, 0]), 0.8, table)).toBeNull();
  });

  it('picks the nearest turned box a ray goes through', () => {
    const rug = pickBoxOf(living, { id: 'a', item: item('bookcase-tall'), variant: item('bookcase-tall').variants[0]!, pose: floorPose(0, 0, 90) });
    const near = { ...rug, id: 'near', position: [0, 1, 2] as const };
    const ray = down([0, 1, 6], [0, 1, 0]);
    expect(rayBoxDistance(ray, rug)).toBeCloseTo(6 - 0.45, 1);
    expect(pickNearest(ray, [rug, near])?.id).toBe('near');
    expect(pickNearest(down([5, 1, 6], [5, 1, 0]), [rug, near])).toBeNull();
    // Turned 90 degrees, a 0.9 × 0.35 bookcase is 0.35 wide and 0.9 deep.
    expect(rayBoxDistance(down([0.3, 1, 6], [0.3, 1, 0]), rug)).toBeNull();
    expect(rayBoxDistance(down([0, 1, 6], [0, 1, 0]), rug)).not.toBeNull();
  });
});

describe('the walker meets the decor', () => {
  it('adds solid pieces to the room’s colliders, but not rugs, wall pieces or tabletop pieces', () => {
    const template = HOME_LAYOUTS['home-flat'].rooms[0]!.template;
    const pieces = [
      { id: 'a', item: item('bookcase-tall'), variant: item('bookcase-tall').variants[0]!, spot: { templateId: 'home-flat', roomId: 'living', x: 0.5, z: 0.5, y: 0, rot: 0, wall: null, onId: null } },
      { id: 'b', item: item('rug-persian'), variant: item('rug-persian').variants[0]!, spot: { templateId: 'home-flat', roomId: 'living', x: -1, z: 0.5, y: 0, rot: 0, wall: null, onId: null } },
      { id: 'c', item: item('art-print-framed'), variant: item('art-print-framed').variants[0]!, spot: { templateId: 'home-flat', roomId: 'living', x: -2, z: -2.7, y: 1.2, rot: 0, wall: 'back' as const, onId: null } },
      { id: 'd', item: item('flowers-vase'), variant: item('flowers-vase').variants[0]!, spot: { templateId: 'home-flat', roomId: 'living', x: 0.5, z: 0.5, y: 0.8, rot: 0, wall: null, onId: 'a' } },
    ];
    const augmented = withDecorColliders(template, pieces);
    expect(augmented.props).toHaveLength(template.props.length + 1);
    const before = roomColliders(template);
    const after = roomColliders(augmented);
    expect(after).toHaveLength(before.length + 1);
    const bookcase = after.find((box) => Math.abs(box.minX - (0.5 - 0.45)) < 0.01 && Math.abs(box.maxZ - (0.5 + 0.175)) < 0.01);
    expect(bookcase?.height).toBeCloseTo(1.9);
    // No decor: the template comes back untouched.
    expect(withDecorColliders(template, [])).toBe(template);
  });

  it('reads the room’s own furniture and wall fittings as fixtures to avoid', () => {
    const template = HOME_LAYOUTS['home-mansion'].rooms[0]!.template;
    expect(fixturesOf(template).length).toBeGreaterThan(0);
    for (const fixture of fixturesOf(template)) expect(fixture.height).toBeGreaterThan(0);
    for (const mount of wallMountsOf(template)) {
      expect(mount.y1).toBeGreaterThan(mount.y0);
      expect(['back', 'left']).toContain(mount.wall);
    }
  });
});
