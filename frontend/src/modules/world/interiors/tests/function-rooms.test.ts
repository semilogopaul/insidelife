import { describe, expect, it } from 'vitest';
import { NO_FURNISHING, type HomeFurnishing } from '@insidelife/shared';
import { actionNeeds, MISSING_ACTION_NOTE, findAction } from '@insidelife/shared';
import { buildHotspots, hotspotCard } from '../hotspots/hotspots';
import { FLAT_LAYOUT, HOME_LAYOUTS, MANSION_LAYOUT } from '../layouts/catalog';
import { functionRooms, withFunctionRooms } from '../layouts/function-rooms';
import { WARDROBE_SERVICE } from '@/common/places';
import { furnishedHome } from './furnished-home';

const found = (roomId: string): HomeFurnishing['sleep'] => ({ pieceId: 'p', itemId: 'x', roomId, quality: 0.5 });

describe('where things happen in a home you furnish', () => {
  it('leaves the authored rooms alone when there is nothing to go by except the kitchen for meals', () => {
    const rooms = functionRooms(MANSION_LAYOUT, NO_FURNISHING);
    expect(rooms.sleep).toBe(MANSION_LAYOUT.activityRooms.sleep);
    // The authored mansion ate in the living room; with no table at all, the kitchen it is.
    expect(MANSION_LAYOUT.activityRooms.eat).toBe('living');
    expect(rooms.eat).toBe('kitchen');
  });

  it('follows the pieces: the bed, the table, the sofa and the desk say where you sleep, eat, sit and work', () => {
    const rooms = functionRooms(MANSION_LAYOUT, { ...NO_FURNISHING, sleep: found('cinema'), eat: found('master'), sit: found('kitchen'), study: found('living') });
    expect(rooms).toMatchObject({ sleep: 'cinema', eat: 'master', sit: 'kitchen', phone: 'kitchen', type: 'living', read: 'living' });
  });

  it('ignores rooms the home does not have, and one-room homes', () => {
    expect(functionRooms(FLAT_LAYOUT, { ...NO_FURNISHING, sleep: found('attic') }).sleep).toBe('bedroom');
    const single = HOME_LAYOUTS['home-face-me'];
    expect(withFunctionRooms(single, { ...NO_FURNISHING, sleep: found('room') })).toBeDefined();
    const studio = HOME_LAYOUTS['home-self-contain'];
    expect(withFunctionRooms(studio, NO_FURNISHING)).toBe(studio);
  });

  it('hands back the same layout when nothing changed (so the walk does not reset)', () => {
    const furnished = furnishedHome('home-flat', ['dining-set', 'sofa-leather', 'bed-spring']).home;
    const once = withFunctionRooms(FLAT_LAYOUT, furnished);
    expect(once.activityRooms.eat).toBe('kitchen');
    expect(once.rooms).toBe(FLAT_LAYOUT.rooms);
    expect(withFunctionRooms(once, furnished)).toBe(once);
  });
});

describe('a missing piece says so on the action', () => {
  it('names the furniture the action wants, and carries the note onto its card', () => {
    const sleep = findAction('sleep')!;
    expect(actionNeeds(sleep)).toBe('sleep');
    const home = furnishedHome('home-flat', []);
    const bedroom = home.rooms.get('bedroom')!;
    const [hotspot] = buildHotspots(bedroom, [sleep], FLAT_LAYOUT.rooms.find((room) => room.id === 'bedroom')!.template);
    const card = hotspotCard(hotspot!, () => ({ priceNote: '', reason: null, note: MISSING_ACTION_NOTE.sleep }));
    expect(card.entries[0]).toMatchObject({ disabled: null, missing: 'No bed here yet — buy one in the furniture store' });
    // With the piece there, no note.
    const calm = hotspotCard(hotspot!, () => ({ priceNote: '', reason: null }));
    expect(calm.entries[0]!.missing).toBeNull();
  });
});

describe('the wardrobe', () => {
  it('is where you change clothes: the service attaches to the wardrobe you put in the room', () => {
    const home = furnishedHome('home-flat', ['wardrobe-wooden']);
    expect(home.home.dress?.roomId).toBe('bedroom');
    const bedroom = home.rooms.get('bedroom')!;
    const [hotspot] = buildHotspots(bedroom, [], FLAT_LAYOUT.rooms.find((room) => room.id === 'bedroom')!.template, [WARDROBE_SERVICE]);
    expect(hotspot).toMatchObject({ kind: 'wardrobe', name: 'Wardrobe' });
    expect(hotspot!.services.map((service) => service.id)).toEqual(['home-wardrobe']);
  });
});
