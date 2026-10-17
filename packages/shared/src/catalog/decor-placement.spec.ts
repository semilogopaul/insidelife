import { describe, expect, it } from 'vitest';
import {
  canonicalPose,
  checkDecorPlacement,
  decorRect,
  polygonsOverlap,
  rectCorners,
  rectsOverlap,
  wallPose,
  type DecorPose,
  type PlacedDecor,
} from './decor-placement.js';
import { DECOR_HOME_ROOMS, findDecorRoom, isDecorTemplate } from './decor-rooms.js';
import { findDecorItem, DECOR_ITEMS } from './decor.js';

const living = DECOR_HOME_ROOMS['home-flat'].living; // 6.6 × 5.4; doors: left @1.55, back @-0.6 and @2.4; window back @1.05
const floorPose = (x: number, z: number, rot = 0): DecorPose => ({ x, z, y: 0, rot, wall: null, onId: null });
const item = (id: string) => findDecorItem(id)!;
const placed = (id: string, itemId: string, pose: DecorPose): PlacedDecor => ({ id, itemId, pose });

describe('geometry', () => {
  it('turns rectangles about +Y like three.js (90 degrees sends the front, +z, to +x)', () => {
    const corners = rectCorners({ x: 0, z: 0, w: 2, d: 1, rot: 90 });
    const xs = corners.map((p) => p.x);
    const zs = corners.map((p) => p.z);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(2);
  });

  it('treats touching as clear and crossing as overlap, for turned pieces too', () => {
    const a = { x: 0, z: 0, w: 1, d: 1, rot: 0 };
    expect(rectsOverlap(a, { x: 1, z: 0, w: 1, d: 1, rot: 0 })).toBe(false);
    expect(rectsOverlap(a, { x: 0.9, z: 0, w: 1, d: 1, rot: 0 })).toBe(true);
    expect(rectsOverlap(a, { x: 1.1, z: 0, w: 1, d: 1, rot: 45 })).toBe(true);
    expect(rectsOverlap(a, { x: 1.5, z: 0, w: 1, d: 1, rot: 45 })).toBe(false);
    expect(polygonsOverlap(rectCorners(a), rectCorners(a))).toBe(true);
  });

  it('knows every decorable room and refuses the family house and hostels', () => {
    expect(findDecorRoom('home-mansion', 'master')?.width).toBe(8);
    expect(findDecorRoom('home-flat', 'nope')).toBeUndefined();
    expect(findDecorRoom('home-family', 'room')).toBeUndefined();
    expect(findDecorRoom('home-hostel', 'room')).toBeUndefined();
    expect(findDecorRoom('home-flat', 'toString')).toBeUndefined();
    expect(isDecorTemplate('home-duplex')).toBe(true);
    expect(isDecorTemplate('club')).toBe(false);
  });
});

describe('floor pieces', () => {
  const sofaTable = item('table-coffee-marble');

  it('accepts a piece inside the room and rounds its pose', () => {
    const verdict = checkDecorPlacement(living, sofaTable, floorPose(0.123, 0.456), []);
    expect(verdict).toMatchObject({ ok: true, pose: { x: 0.12, z: 0.46, y: 0, rot: 0 } });
  });

  it('refuses anything poking through a wall', () => {
    expect(checkDecorPlacement(living, sofaTable, floorPose(3.2, 0), [])).toMatchObject({ ok: false, code: 'OUT_OF_ROOM' });
    expect(checkDecorPlacement(living, sofaTable, floorPose(-3.3 + 0.55, -2.7 + 0.3), [])).toMatchObject({ ok: true });
    expect(checkDecorPlacement(living, sofaTable, floorPose(-3.3 + 0.55, -2.7 + 0.3, 90), [])).toMatchObject({ ok: false, code: 'OUT_OF_ROOM' });
    expect(checkDecorPlacement(living, sofaTable, floorPose(Number.NaN, 0), [])).toMatchObject({ ok: false, code: 'BAD_POSE' });
  });

  it('keeps doors clear, but lets a rug lie across them', () => {
    expect(checkDecorPlacement(living, sofaTable, floorPose(2.4, -2.7 + 0.5), [])).toMatchObject({ ok: false, code: 'BLOCKS_DOOR' });
    expect(checkDecorPlacement(living, sofaTable, floorPose(-3.3 + 0.4, 1.55, 90), [])).toMatchObject({ ok: false, code: 'BLOCKS_DOOR' });
    expect(checkDecorPlacement(living, item('rug-runner'), floorPose(2.1, -2.7 + 0.5), [])).toMatchObject({ ok: true });
  });

  it('keeps stairs clear', () => {
    const duplex = DECOR_HOME_ROOMS['home-duplex'].living;
    expect(checkDecorPlacement(duplex, item('plant-areca-palm'), floorPose(-2.5, -2.6), [])).toMatchObject({ ok: false, code: 'BLOCKS_STAIRS' });
    expect(checkDecorPlacement(duplex, item('plant-areca-palm'), floorPose(0.5, 0), [])).toMatchObject({ ok: true });
  });

  it('does not let pieces overlap, but rugs go under furniture', () => {
    const bed = placed('a', 'bed-divan-queen', floorPose(0, 0));
    expect(checkDecorPlacement(living, sofaTable, floorPose(0.5, 0.3), [bed])).toMatchObject({ ok: false, code: 'OVERLAP' });
    expect(checkDecorPlacement(living, sofaTable, floorPose(2.5, 0), [bed])).toMatchObject({ ok: true });
    const rug = placed('r', 'rug-persian', floorPose(-1.5, 1));
    expect(checkDecorPlacement(living, item('bed-divan-queen'), floorPose(-1.5, 1), [rug])).toMatchObject({ ok: true });
    expect(checkDecorPlacement(living, item('rug-shaggy'), floorPose(-1.5, 1.2), [rug])).toMatchObject({ ok: false, code: 'OVERLAP' });
  });

  it('only turns in 15 degree steps', () => {
    expect(checkDecorPlacement(living, sofaTable, floorPose(0, 0, 45), [])).toMatchObject({ ok: true, pose: { rot: 45 } });
    expect(checkDecorPlacement(living, sofaTable, floorPose(0, 0, 10), [])).toMatchObject({ ok: false, code: 'BAD_POSE' });
    expect(checkDecorPlacement(living, sofaTable, floorPose(0, 0, -90), [])).toMatchObject({ ok: true, pose: { rot: 270 } });
  });

  it('refuses a wall mount on a floor piece', () => {
    expect(checkDecorPlacement(living, sofaTable, { ...floorPose(0, 0), wall: 'back' }, [])).toMatchObject({ ok: false, code: 'WRONG_PLACEMENT' });
  });
});

describe('wall pieces', () => {
  const print = item('art-print-framed'); // 0.6 wide, 0.8 tall
  const at = (wall: 'back' | 'left', u: number, y = 1.2): DecorPose => wallPose(living, wall, u, y);

  it('snaps onto the wall line facing into the room', () => {
    expect(canonicalPose(living, print, { x: 1, z: 1, y: 1.234, rot: 77, wall: 'back', onId: null })).toEqual({ x: 1, z: -2.7, y: 1.23, rot: 0, wall: 'back', onId: null });
    expect(canonicalPose(living, print, { x: 1, z: 0.5, y: 1.2, rot: 0, wall: 'left', onId: null })).toEqual({ x: -3.3, z: 0.5, y: 1.2, rot: 90, wall: 'left', onId: null });
    expect(decorRect(living, print, at('left', 0.5))).toMatchObject({ rot: 90, z: 0.5 });
  });

  it('keeps art on its stretch of wall, off doors and windows, and below the ceiling', () => {
    expect(checkDecorPlacement(living, print, at('back', -1.5), [])).toMatchObject({ ok: true });
    expect(checkDecorPlacement(living, print, at('back', 3.2), [])).toMatchObject({ ok: false, code: 'OUT_OF_ROOM' });
    expect(checkDecorPlacement(living, print, at('back', 2.4), [])).toMatchObject({ ok: false, code: 'BLOCKS_DOOR' });
    expect(checkDecorPlacement(living, print, at('back', 1.05), [])).toMatchObject({ ok: false, code: 'BLOCKS_WINDOW' });
    expect(checkDecorPlacement(living, print, at('back', -1.5, 2.0), [])).toMatchObject({ ok: false, code: 'OUT_OF_ROOM' });
    expect(checkDecorPlacement(living, print, at('left', 0.5, 1.2), [])).toMatchObject({ ok: true });
    expect(checkDecorPlacement(living, print, at('left', 1.55), [])).toMatchObject({ ok: false, code: 'BLOCKS_DOOR' });
  });

  it('does not stack wall pieces on each other, but allows a gap', () => {
    const other = placed('w', 'art-print-framed', at('back', -2.4));
    expect(checkDecorPlacement(living, print, at('back', -2.1), [other])).toMatchObject({ ok: false, code: 'OVERLAP' });
    expect(checkDecorPlacement(living, print, at('back', -1.5), [other])).toMatchObject({ ok: true });
    expect(checkDecorPlacement(living, print, at('left', -2), [other])).toMatchObject({ ok: true });
  });

  it('does not hang art behind a tall piece standing against the wall', () => {
    const bookcase = placed('b', 'bookcase-tall', floorPose(-2.2, -2.7 + 0.175));
    expect(checkDecorPlacement(living, print, at('back', -2.2), [bookcase])).toMatchObject({ ok: false, code: 'OVERLAP' });
    expect(checkDecorPlacement(living, print, at('back', -2.2, 2.0 - 0.7), [bookcase])).toMatchObject({ ok: false });
    // Above it (bookcase is 1.9 tall, room is 2.6) there's no space for a 0.8 print, but a low rug doesn't matter.
    const rug = placed('r', 'rug-persian', floorPose(-2.2, -2.7 + 0.85));
    expect(checkDecorPlacement(living, print, at('back', -2.2), [rug])).toMatchObject({ ok: true });
  });

  it('keeps a floor piece off a wall piece hanging low over it', () => {
    const mirror = placed('m', 'mirror-grand-gilded', wallPose(living, 'back', -2.2, 0.4));
    expect(checkDecorPlacement(living, item('table-console'), floorPose(-2.2, -2.7 + 0.175), [mirror])).toMatchObject({ ok: false, code: 'OVERLAP' });
    expect(checkDecorPlacement(living, item('table-console'), floorPose(-2.2, 0), [mirror])).toMatchObject({ ok: true });
  });
});

describe('tabletop pieces', () => {
  const table = placed('t', 'table-console', floorPose(-2.2, -2.7 + 0.175)); // 1.2 × 0.35, top 0.8
  const vase = item('flowers-vase');
  const onTable = (x: number, z = -2.7 + 0.175): DecorPose => ({ x, z, y: 0, rot: 0, wall: null, onId: 't' });

  it('needs a surface and sits at its height', () => {
    expect(checkDecorPlacement(living, vase, onTable(-2.2), [table])).toMatchObject({ ok: true, pose: { y: 0.8, onId: 't' } });
    expect(checkDecorPlacement(living, vase, { ...onTable(-2.2), onId: null }, [table])).toMatchObject({ ok: false, code: 'NO_SURFACE' });
    expect(checkDecorPlacement(living, vase, { ...onTable(-2.2), onId: 'ghost' }, [table])).toMatchObject({ ok: false, code: 'NO_SURFACE' });
    expect(checkDecorPlacement(living, vase, onTable(-2.2), [placed('t', 'rug-persian', floorPose(-1, 0))])).toMatchObject({ ok: false, code: 'NO_SURFACE' });
  });

  it('stays on the surface and off its neighbours', () => {
    expect(checkDecorPlacement(living, vase, onTable(-0.9), [table])).toMatchObject({ ok: false, code: 'NO_SURFACE' });
    const first = placed('v1', 'flowers-vase', { ...onTable(-2.5), y: 0.8 });
    expect(checkDecorPlacement(living, vase, onTable(-2.4), [table, first])).toMatchObject({ ok: false, code: 'OVERLAP' });
    expect(checkDecorPlacement(living, vase, onTable(-1.9), [table, first])).toMatchObject({ ok: true });
  });

  it('sits cushions on a bed and stuff on a wall shelf', () => {
    const bed = placed('b', 'bed-divan-queen', floorPose(0, 0));
    expect(checkDecorPlacement(living, item('cushions-scatter'), { x: 0, z: -0.8, y: 0, rot: 0, wall: null, onId: 'b' }, [bed])).toMatchObject({ ok: true, pose: { y: 0.56 } });
    const shelf = placed('s', 'shelf-floating', wallPose(living, 'back', -1.5, 1.3));
    expect(checkDecorPlacement(living, vase, { x: -1.5, z: -2.7 + 0.13, y: 0, rot: 0, wall: null, onId: 's' }, [shelf])).toMatchObject({ ok: true, pose: { y: 1.35 } });
  });

  it('does not nest tabletop pieces', () => {
    const cushionBed = placed('b', 'bed-divan-queen', floorPose(0, 0));
    const cushions = placed('c', 'cushions-scatter', { x: 0, z: -0.8, y: 0.56, rot: 0, wall: null, onId: 'b' });
    expect(checkDecorPlacement(living, vase, { x: 0, z: -0.8, y: 0, rot: 0, wall: null, onId: 'c' }, [cushionBed, cushions])).toMatchObject({ ok: false, code: 'NO_SURFACE' });
  });
});

describe('every item can be placed somewhere in a big room', () => {
  const master = DECOR_HOME_ROOMS['home-mansion'].master;
  it.each(DECOR_ITEMS.filter((entry) => entry.placement === 'floor'))('floor: $id', (entry) => {
    expect(checkDecorPlacement(master, entry, floorPose(0.7, 0.4), [])).toMatchObject({ ok: true });
  });
  it.each(DECOR_ITEMS.filter((entry) => entry.placement === 'wall'))('wall: $id', (entry) => {
    expect(checkDecorPlacement(master, entry, wallPose(master, 'left', 1.2, entry.hangAt ?? 1.2), [])).toMatchObject({ ok: true });
  });
});
