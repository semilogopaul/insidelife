import { describe, expect, it } from 'vitest';
import {
  DECOR_AIRCRAFT_ROOMS,
  DECOR_ITEMS,
  aircraftDecorTemplateId,
  aircraftRoomIssue,
  checkAircraftDecorPlacement,
  findAircraftDecorRoom,
  findDecorItem,
  type DecorItem,
  type DecorRoom,
  type DecorSpotDto,
  type PlacedDecor,
} from '@insidelife/shared';
import { asPieceLike, piecesInRoom, unplacedForCabin } from '@/common/decor';
import { resolveDrop, type DropContext } from '../../interiors/decor/decor-drop';
import { buildDecorGeometry, drawableOf, withDecorColliders } from '../../interiors/decor/decor-scene';
import { fixturesOf, wallMountsOf } from '../../interiors/decor/fixtures';
import { roomColliders } from '../../interiors/walk/colliders';
import { AIRCRAFT_CLASSES } from '../contract';
import { AIRCRAFT_LAYOUTS, aircraftLayoutFor } from '../cabin/cabin-layouts';

/** Float noise from `height * 0.36` and friends: compare to the millimetre. */
const mm = (value: number): number => Math.round(value * 1000) / 1000;

describe('cabin decor room table', () => {
  it('matches the 3D cabin templates it validates placements for (size, doors, windows)', () => {
    expect(Object.keys(DECOR_AIRCRAFT_ROOMS).toSorted()).toEqual(Object.keys(AIRCRAFT_LAYOUTS).toSorted());
    for (const [templateId, rooms] of Object.entries(DECOR_AIRCRAFT_ROOMS)) {
      const layout = AIRCRAFT_LAYOUTS[templateId as keyof typeof AIRCRAFT_LAYOUTS];
      expect(layout, templateId).toBeDefined();
      expect(Object.keys(rooms).toSorted(), templateId).toEqual(layout.rooms.map((room) => room.id).toSorted());
      for (const layoutRoom of layout.rooms) {
        const table: DecorRoom = (rooms as Record<string, DecorRoom>)[layoutRoom.id]!;
        const spec = layoutRoom.template.room;
        const where = `${templateId}/${layoutRoom.id}`;
        expect([table.width, table.depth, table.height].map(mm), where).toEqual([spec.width, spec.depth, spec.height].map(mm));
        expect(table.doors.map((door) => [door.wall, mm(door.at), door.width]), where).toEqual((spec.doors ?? []).map((door) => [door.wall, mm(door.at), door.width]));
        expect(table.windows.map((w) => [w.wall, mm(w.at), w.width, mm(w.sill), mm(w.height)]), where).toEqual(
          (spec.windows ?? []).map((w) => [w.wall, mm(w.at), w.width, mm(w.sill ?? 0.85), mm(w.height ?? 1.05)]),
        );
        // No stairs in an aircraft.
        expect(layoutRoom.template.props.some((prop) => prop.kind === 'stairs' || prop.kind === 'stairwell'), where).toBe(false);
        expect(table.keepOut, where).toEqual([]);
        expect(layoutRoom.label, where).toBe(table.label);
      }
    }
  });
});

const pieceAt = (id: string, itemId: string, spot: Partial<DecorSpotDto> & { templateId: string; roomId: string }) => ({
  id,
  itemId,
  variant: findDecorItem(itemId)!.variants[0]!.id,
  spot: { x: 0, z: 0, y: 0, rot: 0, wall: null, onId: null, ...spot },
});

/** Try a grid of floor points and wall stretches: does the cabin have room for this piece at all? */
function fitsSomewhere(cls: (typeof AIRCRAFT_CLASSES)[number], roomId: string, item: DecorItem, others: readonly PlacedDecor[] = []): boolean {
  const layoutRoom = aircraftLayoutFor(cls).rooms.find((room) => room.id === roomId)!;
  const room = findAircraftDecorRoom(aircraftDecorTemplateId(cls), roomId)!;
  const context: DropContext = {
    room,
    item,
    others,
    fixtures: fixturesOf(layoutRoom.template),
    mounts: wallMountsOf(layoutRoom.template),
    rot: 0,
    autoFace: true,
    check: (r, i, pose, near) => checkAircraftDecorPlacement(roomId, r, i, pose, near),
  };
  if (item.placement === 'wall') {
    for (const wall of ['back', 'left'] as const) {
      const length = wall === 'back' ? room.width : room.depth;
      for (let u = -length / 2; u <= length / 2; u += 0.2) {
        for (const y of [0.9, 1.1, 1.3, 1.5]) if (resolveDrop(context, { kind: 'wall', wall, u, y }).ok) return true;
      }
    }
    return false;
  }
  for (let x = -room.width / 2; x <= room.width / 2; x += 0.25) {
    for (let z = -room.depth / 2; z <= room.depth / 2; z += 0.25) {
      if (resolveDrop(context, { kind: 'floor', x, z }).ok) return true;
    }
  }
  return false;
}

describe('dressing the cabins', () => {
  it('has room for a rug and a picture in the cabin of every class', () => {
    for (const cls of AIRCRAFT_CLASSES) {
      expect(fitsSomewhere(cls, 'cabin', findDecorItem('cabin-rug')!), `${cls} rug`).toBe(true);
      expect(fitsSomewhere(cls, 'cabin', findDecorItem('cabin-print')!), `${cls} print`).toBe(true);
    }
  });

  it('has room for a bench and a minibar in the turboprop and every jet, around the seats', () => {
    for (const cls of ['turboprop', 'light-jet', 'midsize-jet', 'long-range-jet', 'airliner-jet'] as const) {
      expect(fitsSomewhere(cls, 'cabin', findDecorItem('cabin-bench')!), `${cls} bench`).toBe(true);
      expect(fitsSomewhere(cls, 'cabin', findDecorItem('cabin-minibar')!), `${cls} minibar`).toBe(true);
    }
  });

  it('keeps the rules of the flight deck, the lavatory and the suite visible in the drop check', () => {
    const deck = (cls: (typeof AIRCRAFT_CLASSES)[number]) => findAircraftDecorRoom(aircraftDecorTemplateId(cls), 'cockpit')!;
    expect(fitsSomewhere('light-jet', 'cockpit', findDecorItem('cabin-rug')!)).toBe(false);
    expect(fitsSomewhere('light-jet', 'cockpit', findDecorItem('cabin-print')!)).toBe(true);
    expect(fitsSomewhere('light-jet', 'lavatory', findDecorItem('cabin-rug')!)).toBe(false);
    expect(fitsSomewhere('long-range-jet', 'cabin', findDecorItem('bed-divan-queen')!)).toBe(false);
    expect(fitsSomewhere('long-range-jet', 'suite', findDecorItem('bed-single-guest')!)).toBe(true);
    expect(fitsSomewhere('airliner-jet', 'suite', findDecorItem('bed-single-guest')!)).toBe(true);
    expect(fitsSomewhere('airliner-jet', 'cabin', findDecorItem('aquarium-nano')!)).toBe(false);
    // The tallest bed still clears the lowest suite ceiling.
    for (const entry of DECOR_ITEMS.filter((candidate) => candidate.aircraft === 'suite')) {
      expect(aircraftRoomIssue('suite', findAircraftDecorRoom('aircraft-long-range-jet', 'suite')!, entry), entry.id).toBeNull();
    }
    expect(deck('turboprop').height).toBeGreaterThan(1.5);
  });

  it('seats small pieces on the minibar, in the template’s own cabin', () => {
    const cabin = aircraftLayoutFor('midsize-jet').rooms[0]!;
    const room = findAircraftDecorRoom('aircraft-midsize-jet', 'cabin')!;
    const bar = findDecorItem('cabin-minibar')!;
    const spot = (() => {
      for (let x = -room.width / 2; x < room.width / 2; x += 0.25) {
        for (let z = -room.depth / 2; z < room.depth / 2; z += 0.25) {
          const drop = resolveDrop(
            { room, item: bar, others: [], fixtures: fixturesOf(cabin.template), mounts: wallMountsOf(cabin.template), rot: 0, autoFace: true, check: (r, i, p, n) => checkAircraftDecorPlacement('cabin', r, i, p, n) },
            { kind: 'floor', x, z },
          );
          if (drop.ok) return drop.pose;
        }
      }
      return null;
    })()!;
    const placedBar: PlacedDecor = { id: 'bar', itemId: bar.id, pose: spot };
    const drop = resolveDrop(
      { room, item: findDecorItem('cabin-lamp')!, others: [placedBar], fixtures: [], mounts: [], rot: 0, autoFace: false, check: (r, i, p, n) => checkAircraftDecorPlacement('cabin', r, i, p, n) },
      { kind: 'surface', parentId: 'bar', x: spot.x, z: spot.z },
    );
    expect(drop).toMatchObject({ ok: true, pose: { onId: 'bar', y: 0.95 } });
  });
});

describe('showing the cabin decor', () => {
  const spots = [
    pieceAt('rug', 'cabin-rug', { templateId: 'aircraft-light-jet', roomId: 'cabin', x: 0, z: 0.5 }),
    pieceAt('print', 'cabin-print', { templateId: 'aircraft-light-jet', roomId: 'cockpit', x: 0, z: -1.3, y: 0.9, wall: 'back' }),
    pieceAt('other', 'cabin-rug', { templateId: 'aircraft-turboprop', roomId: 'cabin', x: 0, z: 0 }),
  ];

  it('picks out the pieces of one room of one cabin template, from the passenger’s view too', () => {
    const likes = spots.map((piece) => asPieceLike({ ...piece, spot: piece.spot }));
    expect(piecesInRoom(likes, 'aircraft-light-jet', 'cabin').map((piece) => piece.id)).toEqual(['rug']);
    expect(piecesInRoom(likes, 'aircraft-light-jet', 'cockpit').map((piece) => piece.id)).toEqual(['print']);
    expect(piecesInRoom(likes, 'aircraft-light-jet', 'lavatory')).toEqual([]);
  });

  it('draws them as geometry and makes the solid ones obstacles for the walker', () => {
    const cabin = aircraftLayoutFor('light-jet').rooms[0]!.template;
    const bar = pieceAt('bar', 'cabin-minibar', { templateId: 'aircraft-light-jet', roomId: 'cabin', x: 1, z: 0.9 });
    const placed = piecesInRoom([bar, spots[0]!].map(asPieceLike), 'aircraft-light-jet', 'cabin');
    expect(placed).toHaveLength(2);
    expect(buildDecorGeometry(placed.map(drawableOf))).not.toBeNull();
    const before = roomColliders(cabin);
    const after = roomColliders(withDecorColliders(cabin, placed));
    expect(after).toHaveLength(before.length + 1); // the minibar; the rug is flat
  });

  it('offers only what the room may hold, and what is not already there', () => {
    const owned = [
      { id: 'a', itemId: 'cabin-rug', variant: 'terracotta', spot: null, recolours: 0 },
      { id: 'b', itemId: 'aquarium-nano', variant: 'tropical', spot: null, recolours: 0 },
      { id: 'c', itemId: 'bed-divan-queen', variant: 'cream', spot: null, recolours: 0 },
      { id: 'd', itemId: 'cabin-rug', variant: 'ivory', recolours: 0, aircraftId: 'plane-1', spot: { templateId: 'aircraft-light-jet', roomId: 'cabin', x: 0, z: 0, y: 0, rot: 0, wall: null, onId: null } },
      { id: 'e', itemId: 'cabin-rug', variant: 'gold', recolours: 0, aircraftId: 'plane-2', spot: { templateId: 'aircraft-light-jet', roomId: 'cabin', x: 0, z: 0, y: 0, rot: 0, wall: null, onId: null } },
    ];
    const room = findAircraftDecorRoom('aircraft-long-range-jet', 'cabin')!;
    const fits = (itemId: string): boolean => aircraftRoomIssue('cabin', room, findDecorItem(itemId)!) === null;
    // Plane 1's own rug is already in this room; plane 2's can be brought over; the tank and the bed can't go.
    expect(unplacedForCabin(owned, 'plane-1', 'cabin', fits).map((piece) => piece.id)).toEqual(['a', 'e']);
    expect(unplacedForCabin(owned, 'plane-1', 'suite', () => true).map((piece) => piece.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
