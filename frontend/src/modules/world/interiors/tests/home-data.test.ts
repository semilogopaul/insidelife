import { describe, expect, it } from 'vitest';
import { DECOR_HOME_FIXTURES, DECOR_HOME_ROOMS, DECOR_PROVIDED_FIXTURES, HOME_SLOT_SPOTS } from '@insidelife/shared';
import { HOME_LAYOUTS } from '../layouts/catalog';
import { roomFixtures, roomSlotSpots } from './home-data';

/**
 * The server places furniture with tables generated from the 3D templates (`packages/shared/src/catalog/decor-fixtures.ts`,
 * `furniture-slots.ts`, `decor-rooms.ts`). If a template changes, these fail until the tables are regenerated
 * (`zz-dump.test.ts` rewrites them).
 */
describe('shared home tables follow the 3D templates', () => {
  it('knows the fittings of every room (a home you rent or own, and the furnished family house and hostels)', () => {
    for (const [templateId, layout] of Object.entries(HOME_LAYOUTS)) {
      expect(Object.keys(DECOR_HOME_FIXTURES[templateId] ?? {}).toSorted(), templateId).toEqual(layout.rooms.map((room) => room.id).toSorted());
      for (const room of layout.rooms) {
        expect(DECOR_HOME_FIXTURES[templateId]?.[room.id], `${templateId}/${room.id} fittings`).toEqual(roomFixtures(room, false));
        expect(DECOR_PROVIDED_FIXTURES[templateId]?.[room.id], `${templateId}/${room.id} provided`).toEqual(roomFixtures(room, true));
      }
    }
  });

  it('remembers where the template put each movable slot (to move existing players across)', () => {
    for (const [templateId, layout] of Object.entries(HOME_LAYOUTS)) {
      for (const room of layout.rooms) {
        const spots = roomSlotSpots(room);
        const known = HOME_SLOT_SPOTS[templateId]?.[room.id] ?? {};
        expect(known, `${templateId}/${room.id}`).toEqual(spots);
      }
    }
  });

  it('covers every home layout with rooms to place furniture in', () => {
    expect(Object.keys(DECOR_HOME_ROOMS).toSorted()).toEqual(Object.keys(HOME_LAYOUTS).toSorted());
  });
});
