import { findAction, type ActionDefinition, type VenueType } from '@insidelife/shared';
import { describe, expect, it } from 'vitest';
import { MORE_HERE_ID, actionsAt, isPlaceAction } from '@/common/places';
import { AVATAR_CLIPS } from '@/common/three/avatar';
import { actionSpot, occupiedFeet } from '../hotspots/action-spots';
import { actionOfInteractable, buildHotspots, hotspotInteractable, hotspotRoom } from '../hotspots/hotspots';
import { closestOnBox, roomObjects } from '../hotspots/objects';
import { AIR_OBO_LAYOUT, DANGOTE_REFINERY_LAYOUT, OBO_MANSION_LAYOUT, placeLayoutFor } from '../layouts/catalog';
import { findRoom, nextPortalTowards, portalGeometry, roomForActivity, roomForPerson } from '../layouts/geometry';
import type { HomeLayout, LayoutRoom } from '../layouts/types';
import { resolveTemplateId } from '../templates/resolve';
import type { At, Spot } from '../templates/types';
import { buildRoomPhysics } from '../walk/home-walk-runtime';
import { approachPoint } from '../walk/nav-grid';

const PLACES: ReadonlyArray<readonly [VenueType, string, HomeLayout]> = [
  ['mansion', 'obo-mansion', OBO_MANSION_LAYOUT],
  ['private-jet', 'air-obo', AIR_OBO_LAYOUT],
  ['refinery', 'dangote-refinery', DANGOTE_REFINERY_LAYOUT],
];

const foot = (spot: Spot): At => [spot.at[0], spot.at[spot.at.length - 1] as number];
const own = (type: VenueType): ActionDefinition[] => actionsAt({ kind: 'venue', venueType: type }).filter(isPlaceAction);
const roomActions = (room: LayoutRoom): ActionDefinition[] => (room.actions ?? []).map((id) => findAction(id) as ActionDefinition);

/** Where you stand when you come into a room: through its first portal, else its default spot. */
function arrival(room: LayoutRoom, physics: ReturnType<typeof buildRoomPhysics>): At {
  const first = room.portals[0];
  const point = first ? portalGeometry(room.template, first).arrival : { x: 0, z: 0 };
  return physics.nav.nearestFree(point.x, point.z, 2.5) ?? [0, 0];
}

describe('showcase places (OBO Mansion, AIR OBO, Dangote Refinery)', () => {
  it('opens each venue on its own multi-room layout', () => {
    for (const [, venueId, layout] of PLACES) {
      expect(placeLayoutFor(resolveTemplateId(venueId)), venueId).toBe(layout);
      expect(findRoom(layout, layout.entry)?.template.id).toBe(layout.id);
    }
    expect(OBO_MANSION_LAYOUT.rooms.map((room) => room.id)).toEqual(['parlour', 'kitchen', 'games', 'cinema', 'gallery', 'studio', 'master', 'guest', 'closet']);
    expect(OBO_MANSION_LAYOUT.rooms.filter((room) => room.template.furniture.some((piece) => piece.model.startsWith('bed'))).length).toBeGreaterThanOrEqual(3);
    expect(AIR_OBO_LAYOUT.rooms.map((room) => room.id)).toEqual(['cabin', 'cockpit', 'lavatory']);
  });

  it('links rooms both ways, has one front door and one light rig per place, and reaches every room', () => {
    for (const [, , layout] of PLACES) {
      for (const room of layout.rooms) {
        for (const portal of room.portals) {
          expect(() => portalGeometry(room.template, portal), `${layout.id}/${room.id}.${portal.id}`).not.toThrow();
          if (!portal.to) continue;
          const back = findRoom(layout, portal.to.room)?.portals.find((candidate) => candidate.id === portal.to?.portal);
          expect(back?.to, `${layout.id}: ${room.id}.${portal.id}`).toEqual({ room: room.id, portal: portal.id });
        }
        if (room.id !== layout.entry) expect(nextPortalTowards(layout, layout.entry, room.id), `${layout.id} → ${room.id}`).not.toBeNull();
      }
      const fronts = layout.rooms.flatMap((room) => room.portals.filter((portal) => portal.to === null).map(() => room.id));
      expect(fronts, layout.id).toEqual([layout.entry]);
      expect(new Set(layout.rooms.map((room) => room.template.lighting.practicals?.length ?? 1)).size, layout.id).toBe(1);
      expect(new Set(layout.rooms.map((room) => room.template.lighting.mood)).size, layout.id).toBe(1);
    }
  });

  it('puts every place action in exactly one room, and offers it there from a hotspot', () => {
    for (const [type, , layout] of PLACES) {
      const actions = own(type);
      expect(actions.length, type).toBeGreaterThan(0);
      for (const action of actions) {
        const rooms = layout.rooms.filter((room) => room.actions?.includes(action.id));
        expect(rooms.map((room) => room.id), `${type}: ${action.id}`).toHaveLength(1);
        expect(hotspotRoom(layout, action)).toBe(rooms[0]?.id);
      }
      for (const room of layout.rooms) {
        const reachable = new Set<string>();
        for (const hotspot of buildHotspots(room.template, roomActions(room))) {
          const offer = hotspotInteractable(hotspot, () => ({ priceNote: '', reason: null }));
          const buttons = [offer, ...(offer?.more ?? [])];
          if (buttons.some((button) => button?.id === MORE_HERE_ID)) for (const action of hotspot.actions) reachable.add(action.id);
          for (const button of buttons) {
            const id = button ? actionOfInteractable(button.id) : null;
            if (id) reachable.add(id);
          }
        }
        for (const id of room.actions ?? []) expect(reachable.has(id), `${layout.id}/${room.id}: ${id}`).toBe(true);
      }
    }
  });

  it('walks you to the room an action happens in, and shows others there', () => {
    expect(roomForActivity(OBO_MANSION_LAYOUT, 'sit', 'parlour', 'obo-movie')).toBe('cinema');
    expect(roomForActivity(OBO_MANSION_LAYOUT, 'sit', 'cinema', 'obo-fifa')).toBe('games');
    expect(roomForActivity(OBO_MANSION_LAYOUT, 'sit', 'parlour', 'obo-listen')).toBe('studio');
    expect(roomForActivity(AIR_OBO_LAYOUT, 'sit', 'cabin', 'air-obo-toilet')).toBe('lavatory');
    expect(roomForActivity(AIR_OBO_LAYOUT, 'phone', 'cabin', 'air-obo-selfie')).toBe('cockpit');
    // Do-anywhere things (scrolling) happen where you are.
    expect(roomForActivity(OBO_MANSION_LAYOUT, 'phone', 'kitchen', 'scroll')).toBe('kitchen');
    expect(roomForPerson(OBO_MANSION_LAYOUT, 'sit', 'obo-movie')).toBe('cinema');
    expect(roomForPerson(DANGOTE_REFINERY_LAYOUT, 'walk', 'refinery-tour')).toBe('gallery');
    expect(roomForPerson(DANGOTE_REFINERY_LAYOUT, null)).toBe('centre');
  });

  it('names the things you use: the snooker table, the arcade, the captain’s seat, the toilet, the model', () => {
    const names = (layout: HomeLayout, room: string): string[] => roomObjects(findRoom(layout, room)!.template).map((object) => object.name);
    expect(names(OBO_MANSION_LAYOUT, 'games')).toEqual(expect.arrayContaining(['Snooker table', 'Arcade', 'PS5 & FIFA']));
    expect(names(OBO_MANSION_LAYOUT, 'studio')).toEqual(expect.arrayContaining(['Mixing desk', 'Vocal booth mic', 'Producer’s couch']));
    expect(names(OBO_MANSION_LAYOUT, 'parlour')).toEqual(expect.arrayContaining(['Artwork: shekpe', 'Artwork: e choke']));
    expect(names(AIR_OBO_LAYOUT, 'cockpit')).toEqual(expect.arrayContaining(['Captain’s seat', 'Co-pilot seat']));
    expect(names(AIR_OBO_LAYOUT, 'lavatory')).toContain('Toilet');
    expect(names(DANGOTE_REFINERY_LAYOUT, 'centre')).toEqual(expect.arrayContaining(['Refinery model', 'Video wall', 'Gift shop']));
    const hotspot = (layout: HomeLayout, room: string, actionId: string): string | undefined => {
      const found = findRoom(layout, room)!;
      return buildHotspots(found.template, roomActions(found)).find((candidate) => candidate.actions.some((action) => action.id === actionId))?.name;
    };
    expect(hotspot(OBO_MANSION_LAYOUT, 'games', 'obo-snooker')).toBe('Snooker table');
    expect(hotspot(OBO_MANSION_LAYOUT, 'games', 'obo-fifa')).toBe('PS5 & FIFA');
    expect(hotspot(AIR_OBO_LAYOUT, 'cockpit', 'air-obo-captain')).toBe('Captain’s seat');
    expect(hotspot(AIR_OBO_LAYOUT, 'cockpit', 'air-obo-selfie')).toBe('Co-pilot seat');
    expect(hotspot(AIR_OBO_LAYOUT, 'lavatory', 'air-obo-toilet')).toBe('Toilet');
    expect(hotspot(DANGOTE_REFINERY_LAYOUT, 'centre', 'refinery-learn')).toBe('Refinery model');
    expect(hotspot(DANGOTE_REFINERY_LAYOUT, 'centre', 'refinery-gift-shop')).toBe('Gift shop');
    // The owner's artwork, exactly as written.
    const lines = OBO_MANSION_LAYOUT.rooms.flatMap((room) => room.template.props.flatMap((prop) => (prop.kind === 'sign' ? prop.lines : [])));
    for (const word of ['shekpe', 'e choke', 'tule jor']) expect(lines.filter((line) => line === word).length, word).toBeGreaterThanOrEqual(2);
  });

  it('keeps spots in the room and off anyone else’s, and can walk to every hotspot and action spot', () => {
    for (const [, , layout] of PLACES) {
      for (const room of layout.rooms) {
        const { template } = room;
        const where = `${layout.id}/${room.id}`;
        const { width, depth } = template.room;
        const spots = [...Object.values(template.player), ...template.npcs, ...template.guests].filter((spot): spot is Spot => spot !== undefined);
        for (const spot of spots) {
          const [x, z] = foot(spot);
          expect(Math.abs(x) < width / 2 && Math.abs(z) < depth / 2, `${where} ${x},${z}`).toBe(true);
        }
        expect(template.player.default, where).toBeDefined();
        expect(template.guests.length, where).toBeGreaterThan(0);
        const occupied = occupiedFeet(template);
        const physics = buildRoomPhysics(template, occupied);
        const from = arrival(room, physics);
        for (const action of roomActions(room)) {
          const spot = foot(actionSpot(template, action));
          expect(occupied.some(([x, z]) => Math.hypot(x - spot[0], z - spot[1]) < 0.3), `${where}: ${action.id} on someone`).toBe(false);
          if (AVATAR_CLIPS[action.animation].kind === 'full' && ['walk', 'idle'].includes(action.animation)) continue;
          const approach = approachPoint(physics.nav, actionSpot(template, action));
          expect(approach, `${where}: approach ${action.id}`).not.toBeNull();
          if (approach) expect(physics.nav.findPath(from, approach), `${where}: walk to ${action.id}`).not.toBeNull();
        }
        for (const hotspot of buildHotspots(template, roomActions(room))) {
          const [cx, cz] = closestOnBox(hotspot.box, from[0], from[1]);
          const target = physics.nav.nearestFree(cx, cz, hotspot.reach + 0.6);
          expect(target, `${where}: stand by ${hotspot.id}`).not.toBeNull();
          if (target) expect(physics.nav.findPath(from, target), `${where}: walk to ${hotspot.id}`).not.toBeNull();
        }
      }
    }
  });
});
