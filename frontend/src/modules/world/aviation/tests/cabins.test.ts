import { describe, expect, it } from 'vitest';
import { placeLayoutFor } from '../../interiors/layouts/catalog';
import { findRoom, nextPortalTowards, portalGeometry } from '../../interiors/layouts/geometry';
import { TEMPLATES } from '../../interiors/templates/registry';
import { INTERIOR_TEMPLATE_IDS, resolveTemplateId } from '../../interiors/templates/resolve';
import type { At, Spot } from '../../interiors/templates/types';
import { occupiedFeet } from '../../interiors/hotspots/action-spots';
import { buildRoomPhysics } from '../../interiors/walk/home-walk-runtime';
import { approachPoint } from '../../interiors/walk/nav-grid';
import { AIRCRAFT_CLASSES, type AircraftClass } from '../contract';
import { AIRCRAFT_LAYOUTS, AIRCRAFT_TEMPLATE_IDS, aircraftLayoutFor, aircraftTemplateId, cabinWidth, passengerSeats } from '../cabin/cabin-layouts';
import { AIRCRAFT_SPECS } from '../model/aircraft-spec';

const foot = (spot: Spot): At => [spot.at[0], spot.at[spot.at.length - 1] as number];

describe('aircraft cabin layouts', () => {
  it('has a layout per class, registered as an interior template like the other places', () => {
    expect(AIRCRAFT_TEMPLATE_IDS).toHaveLength(7);
    for (const cls of AIRCRAFT_CLASSES) {
      const id = aircraftTemplateId(cls);
      expect((INTERIOR_TEMPLATE_IDS as readonly string[]).includes(id), id).toBe(true);
      const layout = aircraftLayoutFor(cls);
      expect(layout.id).toBe(id);
      expect(TEMPLATES[id].id).toBe(id);
      expect(placeLayoutFor(resolveTemplateId(id))).toBe(layout);
      expect(findRoom(layout, layout.entry)?.template.id).toBe(id);
    }
  });

  it('gives each class the rooms it should have', () => {
    const rooms = (cls: AircraftClass): string[] => aircraftLayoutFor(cls).rooms.map((room) => room.id);
    expect(rooms('piston-single')).toEqual(['cabin']);
    expect(rooms('piston-twin')).toEqual(['cabin']);
    expect(rooms('turboprop')).toEqual(['cabin', 'cockpit']);
    expect(rooms('light-jet')).toEqual(['cabin', 'cockpit', 'lavatory']);
    expect(rooms('midsize-jet')).toEqual(['cabin', 'cockpit', 'lavatory']);
    expect(rooms('long-range-jet')).toEqual(['cabin', 'cockpit', 'lavatory', 'suite']);
    expect(rooms('airliner-jet')).toEqual(['cabin', 'cockpit', 'lavatory', 'suite']);
  });

  it('grows with the class: more seats, a longer and deeper cabin, a higher ceiling', () => {
    const widths = AIRCRAFT_CLASSES.map(cabinWidth);
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
    expect(new Set(widths).size).toBe(7);
    const seats = AIRCRAFT_CLASSES.map((cls) => AIRCRAFT_SPECS[cls].seats);
    expect(seats[0]).toBeLessThan(seats[6] as number);
    const depth = AIRCRAFT_CLASSES.map((cls) => aircraftLayoutFor(cls).rooms[0]!.template.room.depth);
    expect(depth).toEqual([...depth].sort((a, b) => a - b));
    const height = AIRCRAFT_CLASSES.map((cls) => aircraftLayoutFor(cls).rooms[0]!.template.room.height);
    expect(height).toEqual([...height].sort((a, b) => a - b));
  });

  it('seats exactly the spec’s passengers, plus pilots up front in the small planes', () => {
    for (const cls of AIRCRAFT_CLASSES) {
      const spec = AIRCRAFT_SPECS[cls];
      expect(passengerSeats(cls), cls).toHaveLength(spec.seats);
      const cabin = aircraftLayoutFor(cls).rooms[0]!.template;
      const named = cabin.furniture.filter((piece) => piece.thing).map((piece) => piece.thing?.name);
      const chairs = cabin.furniture.filter((piece) => piece.model.startsWith('lounge') && !piece.thing);
      expect(chairs, cls).toHaveLength(spec.seats);
      if (cls === 'piston-single' || cls === 'piston-twin') expect(named, cls).toEqual(['Captain’s seat', 'Co-pilot seat']);
      else expect(findRoom(aircraftLayoutFor(cls), 'cockpit')?.template.furniture.map((piece) => piece.thing?.name), cls).toEqual(['Captain’s seat', 'Co-pilot seat']);
    }
  });

  it('links rooms both ways, has the cabin door as the only way out, and one light rig per plane', () => {
    for (const layout of Object.values(AIRCRAFT_LAYOUTS)) {
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
      expect(new Set(layout.rooms.map((room) => room.template.lighting.practicals?.length)).size, layout.id).toBe(1);
      expect(new Set(layout.rooms.map((room) => room.template.lighting.mood)).size, layout.id).toBe(1);
      // Rooms carry ids, sizes, doors and windows (the walls decor and hotspots attach to).
      for (const room of layout.rooms) {
        expect(room.template.room.width, room.id).toBeGreaterThan(1.5);
        expect(room.template.room.doors?.length, `${layout.id}/${room.id} doors`).toBeGreaterThan(0);
      }
      expect(layout.rooms[0]!.template.room.windows?.length, layout.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps every spot inside its room, and can walk from the door to every seat and room', () => {
    for (const layout of Object.values(AIRCRAFT_LAYOUTS)) {
      for (const room of layout.rooms) {
        const { template } = room;
        const where = `${layout.id}/${room.id}`;
        const { width, depth } = template.room;
        const spots = [...Object.values(template.player), ...template.npcs, ...template.guests].filter((spot): spot is Spot => spot !== undefined);
        for (const spot of spots) {
          const [x, z] = foot(spot);
          expect(Math.abs(x) < width / 2 && Math.abs(z) < depth / 2, `${where} ${x},${z}`).toBe(true);
        }
        const physics = buildRoomPhysics(template, occupiedFeet(template));
        const first = room.portals[0];
        const start = first ? portalGeometry(template, first).arrival : { x: 0, z: 0 };
        const from = physics.nav.nearestFree(start.x, start.z, 2.5);
        expect(from, `${where} arrival`).not.toBeNull();
        for (const portal of room.portals) {
          const door = portalGeometry(template, portal).arrival;
          const to = physics.nav.nearestFree(door.x, door.z, 2.5);
          expect(to, `${where} door ${portal.id}`).not.toBeNull();
          if (from && to) expect(physics.nav.findPath(from, to), `${where} → ${portal.id}`).not.toBeNull();
        }
        // A walk to every place you can sit or stand (the way the walker approaches a spot).
        for (const spot of [...Object.values(template.player), ...template.guests]) {
          if (!spot || !from) continue;
          const near = approachPoint(physics.nav, spot);
          expect(near, `${where} approach ${foot(spot)}`).not.toBeNull();
          if (near) expect(physics.nav.findPath(from, near), `${where} → ${foot(spot)}`).not.toBeNull();
        }
      }
    }
  });
});
