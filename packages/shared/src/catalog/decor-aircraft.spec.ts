import { describe, expect, it } from 'vitest';
import { AIRCRAFT_CLASSES } from './aviation.js';
import {
  AIRCRAFT_DECOR_ROOMS,
  DECOR_AIRCRAFT_ROOMS,
  DECOR_AIRCRAFT_ROOM_CAP,
  aircraftDecorTemplateId,
  aircraftIdOfLocation,
  aircraftLocationId,
  aircraftRoomCap,
  aircraftRoomIssue,
  checkAircraftDecorPlacement,
  findAircraftDecorRoom,
  isAircraftDecorTemplate,
} from './decor-aircraft.js';
import type { DecorPose, PlacedDecor } from './decor-placement.js';
import { DECOR_ITEMS, DECOR_MAX_PER_ROOM, findDecorItem } from './decor.js';

const item = (id: string) => findDecorItem(id)!;
const floor = (x: number, z: number, rot = 0): DecorPose => ({ x, z, y: 0, rot, wall: null, onId: null });
const placed = (id: string, itemId: string, pose: DecorPose): PlacedDecor => ({ id, itemId, pose });
const room = (cls: string, roomId: string) => findAircraftDecorRoom(aircraftDecorTemplateId(cls), roomId)!;

describe('aircraft room table', () => {
  it('has a layout per class with the rooms that class has', () => {
    const rooms = (cls: string): string[] => Object.keys(DECOR_AIRCRAFT_ROOMS[aircraftDecorTemplateId(cls) as keyof typeof DECOR_AIRCRAFT_ROOMS]);
    expect(Object.keys(DECOR_AIRCRAFT_ROOMS)).toEqual(AIRCRAFT_CLASSES.map(aircraftDecorTemplateId));
    expect(rooms('piston-single')).toEqual(['cabin']);
    expect(rooms('piston-twin')).toEqual(['cabin']);
    expect(rooms('turboprop')).toEqual(['cabin', 'cockpit']);
    expect(rooms('light-jet')).toEqual(['cabin', 'cockpit', 'lavatory']);
    expect(rooms('midsize-jet')).toEqual(['cabin', 'cockpit', 'lavatory']);
    expect(rooms('long-range-jet')).toEqual(['cabin', 'cockpit', 'lavatory', 'suite']);
    expect(rooms('airliner-jet')).toEqual(['cabin', 'cockpit', 'lavatory', 'suite']);
    for (const id of AIRCRAFT_DECOR_ROOMS) expect(aircraftRoomCap(id)).toBe(DECOR_AIRCRAFT_ROOM_CAP[id]);
  });

  it('gives every room a door, sane size and a cap under the home cap', () => {
    for (const [templateId, rooms] of Object.entries(DECOR_AIRCRAFT_ROOMS)) {
      for (const [roomId, spec] of Object.entries(rooms as Readonly<Record<string, { readonly width: number; readonly depth: number; readonly height: number; readonly doors: readonly unknown[] }>>)) {
        const where = `${templateId}/${roomId}`;
        expect(spec.doors.length, where).toBeGreaterThan(0);
        expect(spec.width, where).toBeGreaterThan(2);
        expect(spec.height, where).toBeGreaterThanOrEqual(1.5);
        expect(aircraftRoomCap(roomId), where).toBeGreaterThan(0);
        expect(aircraftRoomCap(roomId), where).toBeLessThanOrEqual(DECOR_MAX_PER_ROOM);
      }
    }
  });

  it('finds rooms only of aircraft layouts', () => {
    expect(isAircraftDecorTemplate('aircraft-light-jet')).toBe(true);
    expect(isAircraftDecorTemplate('home-flat')).toBe(false);
    expect(findAircraftDecorRoom('aircraft-light-jet', 'lavatory')?.width).toBe(2.2);
    expect(findAircraftDecorRoom('aircraft-turboprop', 'suite')).toBeUndefined();
    expect(findAircraftDecorRoom('aircraft-light-jet', 'toString')).toBeUndefined();
    expect(findAircraftDecorRoom('home-flat', 'living')).toBeUndefined();
  });

  it('names where the people aboard are', () => {
    expect(aircraftLocationId('abc')).toBe('aircraft:abc');
    expect(aircraftIdOfLocation('aircraft:abc')).toBe('abc');
    expect(aircraftIdOfLocation('home:abc')).toBeNull();
  });
});

describe('what may go in a cabin', () => {
  it('keeps aquariums, bookcases and big trees out, and beds in suites', () => {
    for (const entry of DECOR_ITEMS) {
      if (entry.category === 'aquariums') expect(entry.aircraft, entry.id).toBeUndefined();
      if (entry.category === 'beds') expect(entry.aircraft, entry.id).toBe('suite');
      if (entry.category === 'cabin') expect(entry.aircraft, entry.id).toBe('cabin');
      if (entry.aircraft === 'suite') expect(entry.category, entry.id).toBe('beds');
    }
    expect(item('bookcase-tall').aircraft).toBeUndefined();
    expect(item('plant-areca-palm').aircraft).toBeUndefined();
    expect(item('flowers-vase').aircraft).toBeUndefined();
    expect(item('cabin-flowers').aircraft).toBe('cabin');
  });

  it('has plane-friendly pieces of every kind the brief names', () => {
    const ready = DECOR_ITEMS.filter((entry) => entry.aircraft).map((entry) => entry.id);
    for (const wanted of ['cabin-rug', 'cabin-cushions', 'cabin-throw', 'cabin-print', 'cabin-minibar', 'cabin-lamp', 'cabin-flowers', 'cabin-model']) {
      expect(ready, wanted).toContain(wanted);
    }
    expect(DECOR_ITEMS.filter((entry) => entry.category === 'cabin').length).toBeGreaterThanOrEqual(8);
  });

  it('refuses unsecured pieces, beds outside a suite, and floor pieces on the flight deck or in the lavatory', () => {
    const cabin = room('long-range-jet', 'cabin');
    expect(aircraftRoomIssue('cabin', cabin, item('aquarium-nano'))).toMatch(/secured for flight/);
    expect(aircraftRoomIssue('cabin', cabin, item('bed-divan-queen'))).toMatch(/suite/);
    expect(aircraftRoomIssue('suite', room('long-range-jet', 'suite'), item('bed-divan-queen'))).toBeNull();
    expect(aircraftRoomIssue('cockpit', room('long-range-jet', 'cockpit'), item('rug-persian'))).toMatch(/flight deck/);
    expect(aircraftRoomIssue('cockpit', room('long-range-jet', 'cockpit'), item('cabin-print'))).toBeNull();
    expect(aircraftRoomIssue('cockpit', room('long-range-jet', 'cockpit'), item('cabin-minibar'))).toMatch(/flight deck/);
    expect(aircraftRoomIssue('lavatory', room('light-jet', 'lavatory'), item('cabin-rug'))).toMatch(/lavatory/);
    expect(aircraftRoomIssue('lavatory', room('light-jet', 'lavatory'), item('mirror-round-gold'))).toBeNull();
    expect(aircraftRoomIssue('cabin', cabin, item('cabin-rug'))).toBeNull();
  });

  it('keeps tall pieces under a low ceiling', () => {
    const cessna = room('piston-single', 'cabin'); // 1.5 m
    expect(aircraftRoomIssue('cabin', cessna, item('cabin-minibar'))).toBeNull(); // 1.0 m
    expect(aircraftRoomIssue('cabin', { height: 0.9 }, item('cabin-minibar'))).toMatch(/too tall/);
  });
});

describe('checkAircraftDecorPlacement', () => {
  const cabin = room('light-jet', 'cabin'); // 10 × 2.9, height 1.95

  it('places a rug in the cabin and rounds it like a home piece', () => {
    const verdict = checkAircraftDecorPlacement('cabin', cabin, item('cabin-rug'), floor(0.123, 0.456, 30), []);
    expect(verdict).toMatchObject({ ok: true, pose: { x: 0.12, z: 0.46, y: 0, rot: 30 } });
  });

  it('applies the home geometry: outside the walls, across a door and through a neighbour are refused', () => {
    expect(checkAircraftDecorPlacement('cabin', cabin, item('cabin-bench'), floor(5.2, 0), [])).toMatchObject({ ok: false, code: 'OUT_OF_ROOM' });
    // The cabin door is on the back wall at x = -3.9.
    expect(checkAircraftDecorPlacement('cabin', cabin, item('cabin-bench'), floor(-3.9, -1.1), [])).toMatchObject({ ok: false, code: 'BLOCKS_DOOR' });
    const bench = placed('b', 'cabin-bench', floor(0, 0.5));
    expect(checkAircraftDecorPlacement('cabin', cabin, item('cabin-minibar'), floor(0.3, 0.5), [bench])).toMatchObject({ ok: false, code: 'OVERLAP' });
    // Rugs lie under things.
    expect(checkAircraftDecorPlacement('cabin', cabin, item('cabin-rug'), floor(0, 0.5), [bench]).ok).toBe(true);
  });

  it('sits small pieces on the minibar and keeps them under the ceiling', () => {
    const bar = placed('bar', 'cabin-minibar', floor(0, 0.5));
    const lamp = checkAircraftDecorPlacement('cabin', cabin, item('cabin-lamp'), { x: 0, z: 0.5, y: 0, rot: 0, wall: null, onId: 'bar' }, [bar]);
    expect(lamp).toMatchObject({ ok: true, pose: { y: 0.95, onId: 'bar' } });
    // 0.95 + 0.5 = 1.45 under a 1.5 m piston cabin ceiling is fine; a 1.5 m ceiling with a 1.0 m high bar and 0.55 flowers is not.
    const low = { ...room('piston-single', 'cabin') };
    const tooLow = checkAircraftDecorPlacement('cabin', low, item('cabin-flowers'), { x: 0, z: 0.5, y: 0, rot: 0, wall: null, onId: 'bar' }, [bar]);
    expect(tooLow).toMatchObject({ ok: false, code: 'OUT_OF_ROOM' });
  });

  it('hangs pictures on the cockpit wall but not floor pieces', () => {
    const deck = room('turboprop', 'cockpit');
    const wall: DecorPose = { x: 0, z: 0, y: 0.9, rot: 0, wall: 'back', onId: null };
    expect(checkAircraftDecorPlacement('cockpit', deck, item('cabin-print'), wall, []).ok).toBe(true);
    expect(checkAircraftDecorPlacement('cockpit', deck, item('cabin-rug'), floor(0, 0), [])).toMatchObject({ ok: false, code: 'WRONG_PLACEMENT' });
  });
});
