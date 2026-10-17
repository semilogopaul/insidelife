import { describe, expect, it } from 'vitest';
import { placeLayoutFor } from '../../interiors/layouts/catalog';
import { findRoom, nextPortalTowards, portalGeometry } from '../../interiors/layouts/geometry';
import { roomObjects } from '../../interiors/hotspots/objects';
import { occupiedFeet } from '../../interiors/hotspots/action-spots';
import { TEMPLATES } from '../../interiors/templates/registry';
import { resolveTemplateId, venueTypeFor } from '../../interiors/templates/resolve';
import type { At, Spot } from '../../interiors/templates/types';
import { roomColliders } from '../../interiors/walk/colliders';
import { buildRoomPhysics } from '../../interiors/walk/home-walk-runtime';
import { approachPoint } from '../../interiors/walk/nav-grid';
import { AIRCRAFT_CLASSES, AVIATION_TERMINAL_TYPE, GAT_VENUE_IDS, type AircraftClass, type AircraftLivery } from '../contract';
import { withApronColliders } from '../terminal/apron-colliders';
import { APRON_FREE, APRON_SCALE, BOARDING_RADIUS, MAX_OTHERS, OWN_STAND, atDoor, layoutApron, planeRect, type ApronPlane, type PlacedPlane } from '../terminal/apron-layout';
import { AVIATION_TERMINAL_LAYOUT } from '../terminal/terminal-layout';
import { AIRSIDE_ID, AVIATION_AIRSIDE, AVIATION_LOUNGE, AVIATION_TERMINAL_ID } from '../terminal/terminal-templates';

const foot = (spot: Spot): At => [spot.at[0], spot.at[spot.at.length - 1] as number];
const livery = (n: number): AircraftLivery => ({ base: '#f4f2ec', accent: '#0a7d3c', name: `PLANE ${n}`, registration: '5N-AAA' });
const plane = (id: string, cls: AircraftClass): ApronPlane => ({ id, cls, livery: livery(Number(id.replace(/\D/g, '')) || 0) });

describe('General Aviation Terminal', () => {
  it('is the interior of the aviation-terminal venue type, as a lounge and an airside', () => {
    expect(GAT_VENUE_IDS).toEqual(['mmia-gat', 'naia-gat']);
    expect(AVIATION_TERMINAL_TYPE).toBe('aviation-terminal');
    expect(resolveTemplateId(AVIATION_TERMINAL_ID)).toBe(AVIATION_TERMINAL_ID);
    expect(venueTypeFor(AVIATION_TERMINAL_ID)).toBe('aviation-terminal');
    expect(TEMPLATES[AVIATION_TERMINAL_ID]).toBe(AVIATION_LOUNGE);
    expect(placeLayoutFor(AVIATION_TERMINAL_ID)).toBe(AVIATION_TERMINAL_LAYOUT);
    expect(AVIATION_TERMINAL_LAYOUT.rooms.map((room) => room.id)).toEqual(['lounge', 'airside']);
    expect(AVIATION_TERMINAL_LAYOUT.rooms[1]?.template.id).toBe(AIRSIDE_ID);
  });

  it('has a sales desk, a flight-school corner and a door to the airside in the lounge', () => {
    const names = roomObjects(AVIATION_LOUNGE).map((object) => object.name);
    expect(names).toEqual(expect.arrayContaining(['Aircraft sales desk', 'Flight school board']));
    const lines = AVIATION_LOUNGE.props.flatMap((prop) => (prop.kind === 'sign' ? prop.lines : []));
    expect(lines).toEqual(expect.arrayContaining(['AIRCRAFT SALES', 'FLIGHT SCHOOL', 'AIRSIDE']));
    expect(AVIATION_LOUNGE.room.doors).toHaveLength(2);
    const airside = AVIATION_TERMINAL_LAYOUT.rooms[0]!.portals.find((portal) => portal.id === 'airside')!;
    expect(airside.to).toEqual({ room: 'airside', portal: 'lounge' });
  });

  it('has a row of hangars with closed doors and a Hangar row board airside', () => {
    const signs = AVIATION_AIRSIDE.props.flatMap((prop) => (prop.kind === 'sign' ? prop.lines : []));
    expect(signs).toEqual(expect.arrayContaining(['HANGAR ROW', 'HANGAR 1', 'HANGAR 5']));
    expect(signs.filter((line) => /^HANGAR \d$/.test(line))).toHaveLength(5);
    const doors = AVIATION_AIRSIDE.props.filter((prop) => prop.kind === 'box' && prop.size[0] === 5.6);
    expect(doors).toHaveLength(5);
    expect(AVIATION_AIRSIDE.room.outdoor).toBe(true);
  });

  it('links lounge and airside both ways with one way out, and one light rig', () => {
    const layout = AVIATION_TERMINAL_LAYOUT;
    for (const room of layout.rooms) {
      for (const portal of room.portals) {
        expect(() => portalGeometry(room.template, portal)).not.toThrow();
        if (!portal.to) continue;
        const back = findRoom(layout, portal.to.room)?.portals.find((candidate) => candidate.id === portal.to?.portal);
        expect(back?.to).toEqual({ room: room.id, portal: portal.id });
      }
    }
    expect(nextPortalTowards(layout, 'lounge', 'airside')).not.toBeNull();
    expect(layout.rooms.flatMap((room) => room.portals.filter((portal) => portal.to === null))).toHaveLength(1);
    expect(new Set(layout.rooms.map((room) => room.template.lighting.practicals?.length)).size).toBe(1);
  });

  it('keeps spots in the rooms and can walk the airside from the terminal door to your stand', () => {
    for (const room of AVIATION_TERMINAL_LAYOUT.rooms) {
      const { template } = room;
      const spots = [...Object.values(template.player), ...template.npcs, ...template.guests].filter((spot): spot is Spot => spot !== undefined);
      for (const spot of spots) {
        const [x, z] = foot(spot);
        expect(Math.abs(x) < template.room.width / 2 && Math.abs(z) < template.room.depth / 2, `${room.id} ${x},${z}`).toBe(true);
      }
      const physics = buildRoomPhysics(template, occupiedFeet(template));
      const start = portalGeometry(template, room.portals[0]!).arrival;
      const from = physics.nav.nearestFree(start.x, start.z, 2.5);
      expect(from, room.id).not.toBeNull();
      for (const spot of spots) {
        const near = approachPoint(physics.nav, spot);
        expect(near, `${room.id} ${foot(spot)}`).not.toBeNull();
        if (from && near) expect(physics.nav.findPath(from, near), `${room.id} → ${foot(spot)}`).not.toBeNull();
      }
    }
    // With a plane on every stand, the walker still reaches your plane’s door.
    const airside = AVIATION_TERMINAL_LAYOUT.rooms[1]!;
    const layout = layoutApron(plane('own', 'long-range-jet'), AIRCRAFT_CLASSES.map((cls, i) => plane(`p${i}`, cls)));
    const template = withApronColliders(airside.template, layout);
    const physics = buildRoomPhysics(template, []);
    const start = portalGeometry(template, airside.portals[0]!).arrival;
    const from = physics.nav.nearestFree(start.x, start.z, 2.5)!;
    const door = layout.own!.door;
    const to = physics.nav.nearestFree(door[0], door[1], 1.5);
    expect(to).not.toBeNull();
    expect(physics.nav.findPath(from, to!)).not.toBeNull();
    // The planes are solid.
    expect(roomColliders(template).length).toBeGreaterThan(roomColliders(airside.template).length);
  });
});

describe('the apron', () => {
  const overlap = (a: PlacedPlane, b: PlacedPlane): boolean => {
    const ra = planeRect(a);
    const rb = planeRect(b);
    return ra.minX < rb.maxX && rb.minX < ra.maxX && ra.minZ < rb.maxZ && rb.minZ < ra.maxZ;
  };

  it('puts your plane on your stand, facing the hangars, with its door towards the terminal', () => {
    const layout = layoutApron(plane('own', 'midsize-jet'), []);
    expect(layout.own).toMatchObject({ x: OWN_STAND.x, z: OWN_STAND.z, rot: 180 });
    // Door on the plane’s left; heading 180 turns that towards the terminal on the room’s left.
    expect(layout.own!.door[0]).toBeLessThan(layout.own!.x);
    expect(layoutApron(null, []).own).toBeNull();
  });

  it('shows at most six other planes, never overlapping each other or yours, all on the apron', () => {
    const mixes: AircraftClass[][] = [
      [...AIRCRAFT_CLASSES],
      ['airliner-jet', 'airliner-jet', 'airliner-jet', 'airliner-jet', 'airliner-jet', 'airliner-jet', 'airliner-jet', 'airliner-jet'],
      ['piston-single', 'piston-single', 'piston-twin', 'turboprop', 'light-jet', 'midsize-jet', 'piston-single', 'piston-twin', 'turboprop'],
      ['long-range-jet', 'long-range-jet', 'long-range-jet', 'light-jet', 'piston-single', 'turboprop', 'midsize-jet'],
    ];
    for (const own of [null, ...AIRCRAFT_CLASSES]) {
      for (const mix of mixes) {
        const layout = layoutApron(own ? plane('own', own) : null, mix.map((cls, i) => plane(`p${i}`, cls)));
        const all = layout.own ? [layout.own, ...layout.others] : [...layout.others];
        expect(layout.others.length).toBeLessThanOrEqual(MAX_OTHERS);
        expect(layout.hangared).toBe(mix.length - layout.others.length);
        for (let i = 0; i < all.length; i++) {
          const a = all[i]!;
          const r = planeRect(a);
          expect(r.minX >= APRON_FREE.minX - 1e-6 && r.maxX <= APRON_FREE.maxX + 1e-6, `${a.id} x`).toBe(true);
          expect(r.minZ >= APRON_FREE.minZ - 1e-6 && r.maxZ <= APRON_FREE.maxZ + 1e-6, `${a.id} z`).toBe(true);
          for (let j = i + 1; j < all.length; j++) expect(overlap(a, all[j]!), `${a.id} vs ${all[j]!.id} (${own}, ${mix.join()})`).toBe(false);
        }
      }
    }
  });

  it('fits six ordinary planes (small and medium) and keeps the order given (friends first)', () => {
    const six = ['piston-single', 'turboprop', 'light-jet', 'piston-twin', 'midsize-jet', 'light-jet'] as const;
    const layout = layoutApron(plane('own', 'airliner-jet'), six.map((cls, i) => plane(`p${i}`, cls)));
    expect(layout.others.map((p) => p.id)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5']);
    expect(layout.hangared).toBe(0);
  });

  it('boards you when you reach the door of your own plane', () => {
    const layout = layoutApron(plane('own', 'turboprop'), []);
    const own = layout.own!;
    expect(atDoor(own, own.door[0], own.door[1])).toBe(true);
    expect(atDoor(own, own.door[0] - (BOARDING_RADIUS - 0.1), own.door[1])).toBe(true);
    expect(atDoor(own, own.door[0] - BOARDING_RADIUS - 0.3, own.door[1])).toBe(false);
    expect(atDoor(own, 0, 0)).toBe(false);
    expect(APRON_SCALE).toBeGreaterThan(0.2);
  });
});
