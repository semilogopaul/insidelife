import { describe, expect, it } from 'vitest';
import { checkDecorPlacement, type DecorPose, type PlacedDecor } from './decor-placement.js';
import { DECOR_HOME_ROOMS, findDecorRoom } from './decor-rooms.js';
import { findDecorItem } from './decor.js';
import { FURNITURE_FNS, FURNITURE_ITEMS, FURNITURE_SPECS, findFurnitureSpec, furnitureDecorId } from './furniture.js';
import {
  actionNeeds,
  furnitureRoomIssue,
  homeChecklist,
  homeFurnishing,
  isSmallPiece,
  placeInHome,
  roomRole,
  roomsToTry,
  slotPose,
  type RoomedPiece,
} from './furnishing.js';
import { findItem } from './shop.js';

const floor = (x: number, z: number, rot = 0): DecorPose => ({ x, z, y: 0, rot, wall: null, onId: null });
const piece = (id: string, itemId: string, roomId: string, pose: DecorPose = floor(0, 0)): RoomedPiece => ({ id, itemId, roomId, pose });
const furniture = (shopId: string) => findDecorItem(furnitureDecorId(shopId))!;

describe('furniture catalog', () => {
  it('turns every shop furniture product into a piece with the shop price and name', () => {
    expect(FURNITURE_ITEMS).toHaveLength(FURNITURE_SPECS.length);
    for (const spec of FURNITURE_SPECS) {
      const shop = findItem(spec.shopItemId)!;
      const entry = furniture(spec.shopItemId);
      expect(entry, spec.shopItemId).toBeDefined();
      expect([entry.price, entry.name, entry.shopItemId]).toEqual([shop.price, shop.name, shop.id]);
      expect(entry.shape).toBe('kit');
      expect(entry.variants.length).toBeGreaterThanOrEqual(1);
      expect(findFurnitureSpec(spec.shopItemId)).toBe(spec);
    }
  });

  it('gives each bed the sleep quality the shop says, and decor beds one by tier', () => {
    for (const id of ['bed-foam-mattress', 'bed-spring', 'bed-orthopedic', 'bed-super-king']) {
      expect(furniture(id).fn).toBe('sleep');
      expect(furniture(id).quality).toBe(findItem(id)!.bedQuality);
    }
    expect(findDecorItem('bed-royal-gold')).toMatchObject({ fn: 'sleep', quality: 0.9 });
    expect(findDecorItem('bed-single-guest')).toMatchObject({ fn: 'sleep', quality: 0.45 });
  });

  it('maps every function to a piece that can provide it', () => {
    for (const fn of FURNITURE_FNS) expect(FURNITURE_ITEMS.some((entry) => entry.fn === fn), fn).toBe(true);
  });
});

describe('rooms and functions', () => {
  it('knows what a room is for', () => {
    expect(roomRole('home-mansion', 'master')).toBe('bedroom');
    expect(roomRole('home-flat', 'living')).toBe('living');
    expect(roomRole('home-face-me', 'room')).toBe('single');
    expect(roomRole('aircraft-light-jet', 'cabin')).toBeNull();
    expect(roomRole('home-flat', 'attic')).toBeNull();
  });

  it('keeps functional pieces out of rooms they do not suit', () => {
    expect(furnitureRoomIssue('home-flat', 'bathroom', furniture('bed-spring'))).toMatch(/bedroom/);
    expect(furnitureRoomIssue('home-flat', 'kitchen', furniture('bed-spring'))).toMatch(/bedroom/);
    expect(furnitureRoomIssue('home-flat', 'bedroom', furniture('bed-spring'))).toBeNull();
    expect(furnitureRoomIssue('home-face-me', 'room', furniture('bed-spring'))).toBeNull();
    expect(furnitureRoomIssue('home-mansion', 'kitchen', furniture('dining-set'))).toBeNull();
    expect(furnitureRoomIssue('home-mansion', 'master', furniture('dining-set'))).toMatch(/kitchen/);
    // Decoration goes anywhere; a cabin is not a home.
    expect(furnitureRoomIssue('home-flat', 'bathroom', findDecorItem('plant-snake')!)).toBeNull();
    expect(furnitureRoomIssue('aircraft-light-jet', 'suite', findDecorItem('bed-royal-gold')!)).toBeNull();
  });

  it('uses the best bed in the home and a table in the kitchen over one in the parlour', () => {
    const none = homeFurnishing('home-mansion', []);
    expect(Object.values(none).every((found) => found === null)).toBe(true);

    const beds = homeFurnishing('home-mansion', [
      piece('a', furnitureDecorId('bed-spring'), 'master'),
      piece('b', furnitureDecorId('bed-orthopedic'), 'master'),
      piece('c', furnitureDecorId('bed-super-king'), 'kitchen'),
    ]);
    // The super king in the kitchen is not a bed anyone sleeps in.
    expect(beds.sleep).toMatchObject({ pieceId: 'b', quality: 0.8, roomId: 'master' });

    const tables = homeFurnishing('home-mansion', [piece('t1', furnitureDecorId('dining-set'), 'living'), piece('t2', furnitureDecorId('dining-set'), 'kitchen')]);
    expect(tables.eat).toMatchObject({ pieceId: 't2', roomId: 'kitchen' });
    expect(homeFurnishing('home-mansion', [piece('t1', furnitureDecorId('dining-set'), 'living')]).eat?.roomId).toBe('living');

    const stacked = homeFurnishing('home-mansion', [{ ...piece('x', furnitureDecorId('bed-super-king'), 'master'), pose: { ...floor(0, 0), onId: 'other' } }]);
    expect(stacked.sleep).toBeNull();
  });

  it('counts decor beds and checks off the checklist', () => {
    const furnishing = homeFurnishing('home-flat', [piece('b', 'bed-royal-gold', 'bedroom')]);
    expect(furnishing.sleep?.quality).toBe(0.9);
    const list = homeChecklist(furnishing);
    expect(list.find((entry) => entry.fn === 'sleep')?.ok).toBe(true);
    expect(list.find((entry) => entry.fn === 'eat')).toMatchObject({ ok: false, essential: true, text: 'No table to eat at' });
    expect(homeChecklist(homeFurnishing('home-flat', [])).find((entry) => entry.fn === 'sleep')?.text).toBe('No bed in this home');
    // Missing essentials come first.
    expect(homeChecklist(homeFurnishing('home-flat', []))[0]!.essential).toBe(true);
  });

  it('knows which home actions need a piece', () => {
    expect(actionNeeds({ id: 'sleep' })).toBe('sleep');
    expect(actionNeeds({ id: 'nap' })).toBe('sleep');
    expect(actionNeeds({ id: 'home-meal' })).toBe('eat');
    expect(actionNeeds({ id: 'watch-tv' })).toBe('tv');
    expect(actionNeeds({ id: 'cook' })).toBeNull();
  });

  it('allows only small pieces of your own in a furnished house', () => {
    expect(isSmallPiece(findDecorItem('plant-snake')!)).toBe(true);
    expect(isSmallPiece(findDecorItem('art-print-framed')!)).toBe(true);
    expect(isSmallPiece(findDecorItem('flowers-vase')!)).toBe(true);
    expect(isSmallPiece(findDecorItem('rug-silk-grand')!)).toBe(false);
    expect(isSmallPiece(findDecorItem('bed-single-guest')!)).toBe(false);
    expect(isSmallPiece(furniture('tv-32'))).toBe(false);
  });
});

describe('finding a place', () => {
  const homes = Object.entries(DECOR_HOME_ROOMS).filter(([id]) => !['home-family', 'home-hostel'].includes(id));

  it('puts each piece in a room that suits it, at a spot the placement check accepts', () => {
    for (const [templateId, rooms] of homes) {
      const roomIds = Object.keys(rooms);
      for (const spec of FURNITURE_SPECS) {
        const entry = furniture(spec.shopItemId);
        const hit = placeInHome(templateId, roomIds, entry, () => []);
        expect(hit, `${templateId}/${spec.shopItemId}`).not.toBeNull();
        const room = findDecorRoom(templateId, hit!.roomId)!;
        expect(checkDecorPlacement(room, entry, hit!.pose, []), `${templateId}/${spec.shopItemId}`).toMatchObject({ ok: true });
        expect(furnitureRoomIssue(templateId, hit!.roomId, entry)).toBeNull();
      }
    }
  });

  it('puts the bed in the bedroom and the table to eat at in the kitchen (the mansion, duplex and flat all have one)', () => {
    for (const templateId of ['home-flat', 'home-duplex', 'home-mansion']) {
      const roomIds = Object.keys(DECOR_HOME_ROOMS[templateId as keyof typeof DECOR_HOME_ROOMS]);
      expect(placeInHome(templateId, roomIds, furniture('dining-set'), () => [])?.roomId, templateId).toBe('kitchen');
      const bedRoom = templateId === 'home-mansion' ? 'master' : 'bedroom';
      expect(placeInHome(templateId, roomIds, furniture('bed-spring'), () => [])?.roomId, templateId).toBe(bedRoom);
      expect(placeInHome(templateId, roomIds, furniture('sofa-fabric'), () => [])?.roomId, templateId).toBe('living');
    }
  });

  it('prefers the room you are standing in when the piece suits it, and skips it when it does not', () => {
    const item = furniture('sofa-fabric');
    expect(roomsToTry('home-mansion', ['living', 'kitchen', 'master', 'cinema', 'bathroom'], item, 'cinema')[0]).toBe('cinema');
    expect(roomsToTry('home-mansion', ['living', 'kitchen', 'master', 'cinema', 'bathroom'], item, 'kitchen')[0]).toBe('living');
    expect(roomsToTry('home-mansion', ['living', 'kitchen', 'bathroom'], findDecorItem('plant-snake')!, 'bathroom')).not.toContain('bathroom');
  });

  it('furnishes a flat room by room without anything overlapping, then runs out of room honestly', () => {
    const roomIds = Object.keys(DECOR_HOME_ROOMS['home-flat']);
    const placed = new Map<string, PlacedDecor[]>();
    const add = (shopId: string): string | null => {
      const entry = furniture(shopId);
      const hit = placeInHome('home-flat', roomIds, entry, (roomId) => placed.get(roomId) ?? []);
      if (!hit) return null;
      placed.set(hit.roomId, [...(placed.get(hit.roomId) ?? []), { id: `${shopId}-${placed.size}-${(placed.get(hit.roomId) ?? []).length}`, itemId: entry.id, pose: hit.pose }]);
      return hit.roomId;
    };
    expect([add('bed-orthopedic'), add('wardrobe-wooden'), add('desk-study'), add('dining-set'), add('sofa-leather'), add('tv-55'), add('rug-persian')]).toEqual([
      'bedroom',
      'bedroom',
      'bedroom',
      'kitchen',
      'living',
      'living',
      'living',
    ]);
    // Many beds eventually fill every sleeping room.
    let more = 0;
    while (add('bed-super-king') && more < 10) more++;
    expect(more).toBeLessThan(10);
  });

  it('moves an existing player across: a slot piece lands where the template had it', () => {
    const bed = slotPose('home-flat', 'bedroom', furnitureDecorId('bed-spring'));
    expect(bed).toMatchObject({ x: -0.6, z: -1.45, rot: 0 });
    // The desk's chair is part of the piece: its middle is ahead of where the template's desk stood.
    const desk = slotPose('home-flat', 'bedroom', furnitureDecorId('desk-study'))!;
    expect([desk.x, desk.z]).toEqual([1.6, -1.7]);
    expect(slotPose('home-flat', 'kitchen', furnitureDecorId('bed-spring'))).toBeNull();
    const hit = placeInHome('home-flat', ['living', 'kitchen', 'bedroom'], furniture('bed-spring'), () => [], { legacy: true });
    expect(hit).toMatchObject({ roomId: 'bedroom', pose: { x: -0.6, z: -1.45 } });
  });
});
