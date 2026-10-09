import { describe, expect, it } from 'vitest';
import { HOME_LAYOUTS, homeLayoutFor } from '../layouts/catalog';
import {
  arrivalPortal,
  findRoom,
  isFreeAnimation,
  nextPortalTowards,
  portalGeometry,
  portalLabel,
  roomForActivity,
  roomForPerson,
} from '../layouts/geometry';
import type { HomeLayout } from '../layouts/types';
import { pickPlayerSpot } from '../templates/spots';
import { INTERIOR_TEMPLATE_IDS } from '../templates/resolve';
import type { HomeSlot, InteriorTemplate } from '../templates/types';
import { buildRoomPhysics, portalApproach } from '../walk/home-walk-runtime';
import { approachPoint } from '../walk/nav-grid';

const layouts = Object.values(HOME_LAYOUTS);
const multiRoom = layouts.filter((layout) => layout.rooms.length > 1);

function slotsOf(template: InteriorTemplate): Set<HomeSlot> {
  const slots = new Set<HomeSlot>();
  for (const piece of template.furniture) if (piece.slot) slots.add(piece.slot);
  for (const prop of template.props) if (prop.slot) slots.add(prop.slot);
  return slots;
}

describe('home layouts', () => {
  it('lays out every home template, and no venue', () => {
    for (const id of INTERIOR_TEMPLATE_IDS) {
      if (id.startsWith('home-')) expect(homeLayoutFor(id)?.id, id).toBe(id);
      else expect(homeLayoutFor(id), id).toBeNull();
    }
    expect(multiRoom.map((layout) => layout.id).sort()).toEqual(['home-duplex', 'home-flat', 'home-mansion']);
    expect(HOME_LAYOUTS['home-mansion'].rooms.length).toBeGreaterThanOrEqual(4);
    // The living room of a layout is the home's registered template (what `resolveTemplateId` names).
    for (const layout of layouts) expect(findRoom(layout, layout.entry)?.template.id).toBe(layout.id);
  });

  it('links rooms both ways, with unique ids', () => {
    for (const layout of layouts) {
      expect(new Set(layout.rooms.map((room) => room.id)).size, layout.id).toBe(layout.rooms.length);
      for (const room of layout.rooms) {
        expect(new Set(room.portals.map((portal) => portal.id)).size, `${layout.id}/${room.id}`).toBe(
          room.portals.length,
        );
        for (const portal of room.portals) {
          if (!portal.to) continue;
          const other = findRoom(layout, portal.to.room);
          const back = other?.portals.find((candidate) => candidate.id === portal.to?.portal);
          expect(
            back?.to,
            `${layout.id}: ${room.id}.${portal.id} → ${portal.to.room}.${portal.to.portal}`,
          ).toEqual({ room: room.id, portal: portal.id });
        }
      }
      // Every room can be reached from the front door's room.
      for (const room of layout.rooms)
        if (room.id !== layout.entry)
          expect(
            nextPortalTowards(layout, layout.entry, room.id),
            `${layout.id} → ${room.id}`,
          ).not.toBeNull();
    }
  });

  it('lights every room of a home with the same number of lamps (no shader recompiles between rooms)', () => {
    for (const layout of multiRoom) {
      const counts = new Set(layout.rooms.map((room) => room.template.lighting.practicals?.length ?? 1));
      expect(counts.size, layout.id).toBe(1);
      expect(new Set(layout.rooms.map((room) => room.template.lighting.mood)).size, layout.id).toBe(1);
    }
  });

  it('has exactly one front door, in the entry room', () => {
    for (const layout of layouts) {
      const fronts = layout.rooms.flatMap((room) =>
        room.portals.filter((portal) => portal.to === null).map(() => room.id),
      );
      expect(fronts, layout.id).toEqual([layout.entry]);
    }
  });

  it('puts every home slot in at most one room, so a purchase shows up once', () => {
    for (const layout of multiRoom) {
      const seen = new Map<HomeSlot, string>();
      for (const room of layout.rooms) {
        for (const slot of slotsOf(room.template)) {
          expect(seen.get(slot), `${layout.id}: ${slot} in ${seen.get(slot)} and ${room.id}`).toBeUndefined();
          seen.set(slot, room.id);
        }
      }
      // The essentials have a home somewhere.
      for (const slot of ['bed', 'cooker', 'fridge', 'tv', 'seating'] as const)
        expect(seen.has(slot), `${layout.id}: ${slot}`).toBe(true);
    }
  });

  it('maps activities to rooms that have a spot for them', () => {
    for (const layout of multiRoom) {
      for (const [animation, roomId] of Object.entries(layout.activityRooms)) {
        const room = findRoom(layout, roomId);
        expect(room, `${layout.id}: ${animation} → ${roomId}`).toBeDefined();
        expect(
          room?.template.player[animation as keyof typeof room.template.player],
          `${layout.id}: ${animation} spot in ${roomId}`,
        ).toBeDefined();
      }
      expect(roomForActivity(layout, 'sleep')).not.toBe(layout.entry);
      expect(roomForActivity(layout, 'cook')).toBe('kitchen');
      expect(roomForActivity(layout, 'sit')).toBe(layout.entry);
    }
    const mansion = HOME_LAYOUTS['home-mansion'];
    expect(roomForActivity(mansion, 'sleep')).toBe('master');
    expect(roomForActivity(mansion, 'shower')).toBe('master');
    // Anything unmapped (scrolling your phone) happens wherever you are.
    expect(roomForActivity(mansion, 'phone', 'kitchen')).toBe('kitchen');
    expect(roomForActivity(mansion, 'phone')).toBe('living');
  });

  it('shows others present in the room their activity belongs to', () => {
    const mansion = HOME_LAYOUTS['home-mansion'];
    expect(roomForPerson(mansion, 'sleep')).toBe('master');
    expect(roomForPerson(mansion, 'talk')).toBe('living');
    expect(roomForPerson(mansion, null)).toBe('living');
    expect(isFreeAnimation('idle')).toBe(true);
    expect(isFreeAnimation('cook')).toBe(false);
  });

  it('routes room to room through doors and stairs', () => {
    const mansion = HOME_LAYOUTS['home-mansion'];
    expect(nextPortalTowards(mansion, 'kitchen', 'master')?.id).toBe('living');
    expect(nextPortalTowards(mansion, 'living', 'master')?.id).toBe('up');
    expect(nextPortalTowards(mansion, 'cinema', 'master')?.id).toBe('master');
    expect(nextPortalTowards(mansion, 'master', 'master')).toBeNull();
    // Jumping from the kitchen to the master suite, you come in by its door from the cinema lounge.
    expect(arrivalPortal(mansion, 'kitchen', 'master')).toBe('cinema');
    expect(arrivalPortal(mansion, 'living', 'kitchen')).toBe('living');
    expect(arrivalPortal(mansion, null, 'cinema')).toBe('down');
    const living = findRoom(mansion, 'living');
    const up = living?.portals.find((portal) => portal.id === 'up');
    if (living && up) expect(portalLabel(mansion, living, up)).toBe('Upstairs · Cinema lounge');
  });
});

describe('portal geometry', () => {
  const mansion = HOME_LAYOUTS['home-mansion'];

  it('puts a back-wall door trigger against the wall, arrival in front facing in', () => {
    const living = findRoom(mansion, 'living');
    const spec = living?.portals.find((portal) => portal.id === 'kitchen');
    if (!living || !spec) throw new Error('mansion living room');
    const door = portalGeometry(living.template, spec);
    const D = living.template.room.depth;
    expect(door.kind).toBe('door');
    expect(door.inward).toEqual([0, -1]);
    expect(door.trigger.minZ).toBeLessThan(-D / 2);
    expect(door.trigger.maxZ).toBeCloseTo(-D / 2 + 0.5);
    expect(door.arrival.z).toBeCloseTo(-D / 2 + 0.9);
    expect(door.arrival.heading).toBeCloseTo(Math.PI / 2);
  });

  it('climbs stairs from their foot and goes down a stairwell from its open end', () => {
    const living = findRoom(mansion, 'living');
    const up = living?.portals.find((portal) => portal.id === 'up');
    const cinema = findRoom(mansion, 'cinema');
    const down = cinema?.portals.find((portal) => portal.id === 'down');
    if (!living || !up || !cinema || !down) throw new Error('mansion stairs');
    const stairs = portalGeometry(living.template, up);
    expect(stairs.kind).toBe('stairs-up');
    // The grand staircase climbs towards the left wall (rot -90): you walk −x into it from its foot at x = −1.
    expect(stairs.inward[0]).toBeCloseTo(-1);
    expect(stairs.arrival.x).toBeCloseTo(-0.1);
    const well = portalGeometry(cinema.template, down);
    expect(well.kind).toBe('stairs-down');
    expect(well.inward[1]).toBeCloseTo(-1);
  });

  it('keeps triggers in the room and arrivals walkable, and every door and spot reachable', () => {
    const check = (layout: HomeLayout): void => {
      for (const room of layout.rooms) {
        const { room: spec } = room.template;
        const physics = buildRoomPhysics(
          room.template,
          room.template.npcs.map((npc) => [npc.at[0], npc.at[npc.at.length - 1] as number] as const),
        );
        const where = `${layout.id}/${room.id}`;
        const portals = room.portals.map((portal) => portalGeometry(room.template, portal));
        for (const portal of portals) {
          expect(portal.trigger.minX, `${where} ${portal.id}`).toBeGreaterThanOrEqual(-spec.width / 2 - 0.25);
          expect(portal.trigger.maxX, `${where} ${portal.id}`).toBeLessThanOrEqual(spec.width / 2 + 0.25);
          expect(portal.trigger.minZ, `${where} ${portal.id}`).toBeGreaterThanOrEqual(-spec.depth / 2 - 0.25);
          expect(portal.trigger.maxZ, `${where} ${portal.id}`).toBeLessThanOrEqual(spec.depth / 2 + 0.25);
          expect(
            physics.nav.nearestFree(portal.arrival.x, portal.arrival.z, 0.5),
            `${where} arrival ${portal.id}`,
          ).not.toBeNull();
        }
        const start = portals[0]?.arrival ?? { x: 0, z: 0 };
        const from = physics.nav.nearestFree(start.x, start.z, 1) ?? [0, 0];
        for (const portal of portals) {
          if (!portal.to) continue;
          expect(
            physics.nav.findPath(from, portalApproach(portal)),
            `${where}: walk to ${portal.id}`,
          ).not.toBeNull();
        }
        for (const [animation, spot] of Object.entries(room.template.player)) {
          if (!spot) continue;
          const approach = approachPoint(physics.nav, spot);
          expect(approach, `${where}: approach ${animation}`).not.toBeNull();
          if (approach)
            expect(physics.nav.findPath(from, approach), `${where}: walk to ${animation}`).not.toBeNull();
        }
        // The activities mapped here resolve to their own spot, not the fallback.
        for (const [animation, roomId] of Object.entries(layout.activityRooms)) {
          if (roomId !== room.id) continue;
          expect(
            pickPlayerSpot(room.template.player, animation as keyof typeof layout.activityRooms & 'sleep'),
            `${where}: ${animation}`,
          ).toBe(room.template.player[animation as 'sleep']);
        }
      }
    };
    for (const layout of layouts) check(layout);
  });
});
