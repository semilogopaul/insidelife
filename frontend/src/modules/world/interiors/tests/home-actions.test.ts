import { describe, expect, it } from 'vitest';
import { actionsAt, isPlaceAction, type PlaceObjectKind } from '@/common/places';
import { actionSpot } from '../hotspots/action-spots';
import { buildHotspots, hotspotRoom } from '../hotspots/hotspots';
import { distanceToBox, roomObjects } from '../hotspots/objects';
import { HOME_LAYOUTS } from '../layouts/catalog';
import { findRoom } from '../layouts/geometry';
import { furnishedAsFarAsItFits, furnishedHome } from './furnished-home';
import type { HomeLayout } from '../layouts/types';
import type { InteriorTemplate } from '../templates/types';

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

describe('home actions in the family house, hostels and family flats (their furniture stays put)', () => {
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


// ----- Homes you rent or own: every piece is yours, so every action is where your furniture is ------------------------

/** What a well-furnished home has (as much as fits: the one-room homes are small). */
const EVERYTHING = ['bed-spring', 'dining-set', 'sofa-fabric', 'tv-55', 'desk-study', 'wardrobe-wooden', 'rug-persian'] as const;
const APPLIANCES = ['cooker-gas', 'fridge-double'] as const;

/** The hotspot an action gets in the room it happens in (the same room the walk takes you to). */
function hotspotOf(layout: HomeLayout, rooms: ReadonlyMap<string, InteriorTemplate>, action: (typeof homeActions)[number]) {
  const roomId = hotspotRoom(layout, action);
  const room = findRoom(layout, roomId);
  const furnished = rooms.get(roomId);
  if (!room || !furnished) throw new Error(`${layout.id}: no room ${roomId} for ${action.id}`);
  const [hotspot] = buildHotspots(furnished, [action], room.template);
  return { roomId, furnished, hotspot };
}

const nearestDistance = (hotspot: NonNullable<ReturnType<typeof hotspotOf>['hotspot']>, spot: ReturnType<typeof actionSpot>): number =>
  Math.min(distanceToBox(hotspot.box, spot.at[0], spot.at[spot.at.length - 1] as number), ...hotspot.aliases.map((alias) => distanceToBox(alias, spot.at[0], spot.at[spot.at.length - 1] as number)));

describe('home actions in a home you furnish', () => {
  for (const templateId of ['home-face-me', 'home-self-contain', 'home-flat', 'home-duplex', 'home-mansion'] as const) {
    describe(templateId, () => {
      const home = furnishedAsFarAsItFits(templateId, EVERYTHING, APPLIANCES);

      it('has the pieces that give it a bed, a table to eat at and somewhere to sit', () => {
        expect(home.home.sleep, 'a bed').not.toBeNull();
        expect(home.home.eat, 'a table to eat at').not.toBeNull();
        expect(home.home.sit, 'a sofa').not.toBeNull();
      });

      for (const action of homeActions) {
        const kinds = AT[action.id];
        if (!kinds) continue;
        // A desk or a TV only if there was room for them.
        const needs = action.id === 'watch-tv' || action.id === 'play-games' ? home.home.tv : action.id === 'learn-code' || action.id === 'freelance' ? home.home.study : action.id === 'study' || action.id === 'practice-craft' ? (home.home.study ?? home.home.sit ?? home.home.eat) : true;
        if (!needs) continue;
        it(`${action.id} happens at ${kinds.join(' / ')}, in the room where that piece stands`, () => {
          const { roomId, furnished, hotspot } = hotspotOf(home.layout, home.rooms, action);
          expect(hotspot, `${roomId}: hotspot`).toBeDefined();
          expect(kinds, `${roomId}: ${hotspot?.kind} ${hotspot?.name}`).toContain(hotspot?.kind);
          if (action.id === 'sleep' || action.id === 'nap') expect(roomId).toBe(home.home.sleep?.roomId);
          if (action.id === 'home-meal') expect(roomId).toBe(home.home.eat?.roomId);
          if (!hotspot || !BESIDE.has(action.id)) return;
          const spot = actionSpot(furnished, action);
          expect(nearestDistance(hotspot, spot), `${roomId}: ${action.id} is beside the ${hotspot.name}`).toBeLessThan(0.9);
        });
      }
    });
  }

  it('eats at the kitchen table in a mansion, a duplex and a flat — never in the living room', () => {
    for (const templateId of ['home-flat', 'home-duplex', 'home-mansion'] as const) {
      const home = furnishedHome(templateId, ['dining-set', 'sofa-leather']);
      const meal = homeActions.find((action) => action.id === 'home-meal')!;
      expect(home.home.eat?.roomId, templateId).toBe('kitchen');
      const { roomId, hotspot, furnished } = hotspotOf(home.layout, home.rooms, meal);
      expect(roomId, templateId).toBe('kitchen');
      expect(hotspot?.kind).toBe('table');
      expect(distanceToBox(hotspot!.box, ...(actionSpot(furnished, meal).at.length === 3 ? [actionSpot(furnished, meal).at[0], actionSpot(furnished, meal).at[2]] : [actionSpot(furnished, meal).at[0], actionSpot(furnished, meal).at[1]]) as [number, number])).toBeLessThan(0.9);
    }
  });

  it('eats in the kitchen even with no table at all (never at the parlour), and says what is missing', () => {
    const meal = homeActions.find((action) => action.id === 'home-meal')!;
    for (const templateId of ['home-flat', 'home-duplex', 'home-mansion'] as const) {
      const home = furnishedHome(templateId, ['sofa-leather']);
      expect(home.home.eat).toBeNull();
      expect(hotspotRoom(home.layout, meal), templateId).toBe('kitchen');
    }
  });

  it('puts the bed hotspot where the bed stands, wherever you stand it', () => {
    const sleep = homeActions.find((action) => action.id === 'sleep')!;
    const home = furnishedHome('home-mansion', [{ item: 'bed-super-king', room: 'master' }, 'bed-foam-mattress']);
    expect(hotspotRoom(home.layout, sleep)).toBe('master');
    const { hotspot, furnished } = hotspotOf(home.layout, home.rooms, sleep);
    expect(hotspot?.kind).toBe('bed');
    expect(furnished.player.sleep?.at[1]).toBeCloseTo(0.48);
  });

  it('finds the TV where you put it: in the cinema lounge if that is where it stands', () => {
    const watch = homeActions.find((action) => action.id === 'watch-tv')!;
    const home = furnishedHome('home-mansion', [{ item: 'tv-75', room: 'cinema' }]);
    const { roomId, hotspot } = hotspotOf(home.layout, home.rooms, watch);
    expect(roomId).toBe('cinema');
    expect(hotspot?.kind).toBe('tv');
  });
});
