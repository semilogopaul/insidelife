import { describe, expect, it } from 'vitest';
import { actionsAt, isPlaceAction, type PlaceObjectKind } from '@/common/places';
import { actionSpot } from '../hotspots/action-spots';
import { buildHotspots, hotspotRoom } from '../hotspots/hotspots';
import { distanceToBox, roomObjects } from '../hotspots/objects';
import { HOME_LAYOUTS } from '../layouts/catalog';
import { findRoom } from '../layouts/geometry';

/**
 * Every home action happens at the prop that fits it, in every kind of home: showering in the bathroom, cooking at the
 * cooker, eating at a table, sleeping in the bed. Checked on the hotspots the player actually sees.
 */

/** What each home action is anchored to (the hotspot's thing). */
const AT: Readonly<Record<string, readonly PlaceObjectKind[]>> = {
  sleep: ['bed'],
  nap: ['bed'],
  'home-meal': ['table'],
  cook: ['cooker'],
  shower: ['shower'],
  'watch-tv': ['tv'],
  'play-games': ['tv'],
  study: ['desk', 'table', 'sofa'],
  'learn-code': ['desk', 'table'],
  'practice-craft': ['desk', 'table', 'sofa'],
  freelance: ['desk', 'table'],
};

/** Home actions that need no prop: a workout on the floor, ordering food on the phone. */
const FREE: ReadonlySet<string> = new Set(['home-workout', 'order-food']);

/** Actions that must be right beside their prop (not just anchored to it): where the avatar stands or sits. */
const BESIDE: ReadonlySet<string> = new Set(['sleep', 'nap', 'home-meal', 'cook', 'shower']);

const homeActions = actionsAt({ kind: 'home' }).filter(isPlaceAction);

describe('home actions', () => {
  it('knows every action you can do at home (a new one must be given a prop or marked free)', () => {
    for (const action of homeActions) expect(AT[action.id] !== undefined || FREE.has(action.id), action.id).toBe(true);
  });

  for (const layout of Object.values(HOME_LAYOUTS)) {
    describe(layout.id, () => {
      const rooms = layout.rooms.map((room) => ({ room, objects: roomObjects(room.template) }));
      const has = (kinds: readonly PlaceObjectKind[]): boolean => rooms.some(({ objects }) => objects.some((object) => kinds.includes(object.kind)));

      it('has a bathroom with a toilet and a shower or a bucket bath, and a kitchen with a cooker', () => {
        const bathroom = rooms.find(({ objects }) => objects.some((object) => object.kind === 'toilet'));
        expect(bathroom, 'a room with a toilet').toBeDefined();
        const kinds = new Set(bathroom?.objects.map((object) => object.kind));
        expect(kinds.has('toilet'), 'toilet').toBe(true);
        expect(kinds.has('shower'), 'shower or bucket bath').toBe(true);
        expect(has(['cooker']), 'a cooker').toBe(true);
        expect(has(['bed']), 'a bed').toBe(true);
        expect(has(['table']), 'a table to eat at').toBe(true);
      });

      for (const action of homeActions) {
        const kinds = AT[action.id];
        if (!kinds) continue;
        it(`${action.id} happens at ${kinds.join(' / ')}`, () => {
          const room = findRoom(layout, hotspotRoom(layout, action));
          if (!room) throw new Error(`${layout.id}: no room for ${action.id}`);
          const [hotspot] = buildHotspots(room.template, [action], room.template);
          expect(hotspot, `${room.id}: hotspot`).toBeDefined();
          expect(kinds, `${room.id}: ${hotspot?.kind} ${hotspot?.name}`).toContain(hotspot?.kind);
          if (!hotspot || !BESIDE.has(action.id)) return;
          const spot = actionSpot(room.template, action);
          const distance = Math.min(distanceToBox(hotspot.box, spot.at[0], spot.at[spot.at.length - 1] as number), ...hotspot.aliases.map((alias) => distanceToBox(alias, spot.at[0], spot.at[spot.at.length - 1] as number)));
          expect(distance, `${room.id}: ${action.id} is ${distance.toFixed(2)} m from the ${hotspot.name}`).toBeLessThan(0.9);
        });
      }
    });
  }
});
