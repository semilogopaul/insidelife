import { describe, expect, it } from 'vitest';
import { actionsAt, isPlaceAction } from '@/common/places';
import { actionSpot } from '../hotspots/action-spots';
import { MAX_ADDED_SEATS, withSeating } from '../hotspots/seating';
import { placeLayoutFor } from '../layouts/catalog';
import { getTemplate } from '../templates/registry';
import { INTERIOR_TEMPLATE_IDS, venueTypeFor } from '../templates/resolve';
import type { At, InteriorTemplate, NpcSpot, Spot } from '../templates/types';
import { furnitureFootprint, propFootprint } from '../walk/colliders';

/**
 * Seats are limited and some are the NPCs': whoever sits down — the player for an action, the other players present —
 * must never be left standing or blocked. NPCs give up seats, and the room adds rows when it has to.
 */

/** Every room you walk into as a visitor (homes keep exactly what you own, so aren't here). */
const ROOMS: ReadonlyArray<{ readonly name: string; readonly template: InteriorTemplate; readonly venueType: ReturnType<typeof venueTypeFor> }> = INTERIOR_TEMPLATE_IDS.filter((id) => !id.startsWith('home-')).flatMap((id) =>
  placeLayoutFor(id).rooms.map((room, _index, rooms) => ({ name: `${id}/${room.id}`, template: room.template, venueType: rooms.length === 1 ? venueTypeFor(id) : null })),
);

const SEATED = ['sit', 'eat', 'read', 'type', 'drink'];
const feet = (spot: Spot): At => [spot.at[0], spot.at[spot.at.length - 1] as number];
const dist = (a: At, b: At): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const isSeat = (spot: Spot): boolean => spot.stance === 'sit';
const overlaps = (a: { minX: number; maxX: number; minZ: number; maxZ: number }, b: { minX: number; maxX: number; minZ: number; maxZ: number }, gap = 0): boolean =>
  a.minX < b.maxX - gap && a.maxX > b.minX + gap && a.minZ < b.maxZ - gap && a.maxZ > b.minZ + gap;

describe('the player’s seat', () => {
  it('is a real seat for every sitting action of every venue, however many NPCs are seated', () => {
    for (const { name, template, venueType } of ROOMS) {
      // Multi-room places list their actions per room (their own tests cover them); one-room venues take the type's actions.
      if (!venueType) continue;
      for (const action of actionsAt({ kind: 'venue', venueType }).filter(isPlaceAction)) {
        if (!SEATED.includes(action.animation)) continue;
        const room = withSeating(template, { action, others: 0 });
        const spot = actionSpot(room, action);
        expect(isSeat(spot), `${name}: ${action.id} (${action.animation}) sits`).toBe(true);
        // Not on top of an NPC.
        for (const npc of room.npcs) expect(dist(feet(npc), feet(spot)), `${name}: ${action.id} next to an NPC`).toBeGreaterThan(0.3);
      }
    }
  });

  it('takes the seat from an NPC sitting in it', () => {
    const cbt = getTemplate('cbt-centre');
    const seat = cbt.player.type as Spot;
    const squatter: NpcSpot = { ...seat, theme: 'campus' };
    const crowded: InteriorTemplate = { ...cbt, npcs: [...cbt.npcs, squatter] };
    const room = withSeating(crowded, { action: { animation: 'type' }, others: 0 });
    expect(room.npcs.some((npc) => dist(feet(npc), feet(seat)) < 0.3)).toBe(false);
    expect(room.npcs.length).toBe(crowded.npcs.length - 1);
    expect(actionSpot(room, { animation: 'type' })).toEqual(seat);
  });

  it('frees a bar stool when NPCs and guests hold every one', () => {
    const bar = getTemplate('bar');
    const stools = bar.furniture.filter((piece) => piece.model.startsWith('stoolBar'));
    expect(stools.length).toBeGreaterThan(0);
    const full: InteriorTemplate = {
      ...bar,
      npcs: stools.map((stool): NpcSpot => ({ at: stool.at, rot: stool.rot ?? 0, animation: 'drink', stance: 'sit', theme: 'casual' })),
      guests: [],
    };
    const room = withSeating(full, { action: { animation: 'drink' }, others: 0 });
    const spot = actionSpot(room, { animation: 'drink' });
    expect(isSeat(spot)).toBe(true);
    expect(room.npcs.length).toBe(full.npcs.length - 1);
  });

  it('is the same seat however many others turn up (it never moves under you)', () => {
    for (const { name, template, venueType } of ROOMS) {
      if (!venueType) continue;
      const action = { animation: 'sit' as const };
      const alone = actionSpot(withSeating(template, { action, others: 0 }), action);
      const crowd = actionSpot(withSeating(template, { action, others: 9 }), action);
      expect(feet(crowd), name).toEqual(feet(alone));
    }
  });

  it('adds a seat when a room has none at all', () => {
    const beach = getTemplate('beach');
    const bare: InteriorTemplate = { ...beach, npcs: [], guests: [], player: { default: beach.player.default } };
    const room = withSeating(bare, { action: { animation: 'sit' }, others: 0 });
    expect(isSeat(actionSpot(room, { animation: 'sit' }))).toBe(true);
    expect(room.props.length + room.furniture.length).toBeGreaterThan(bare.props.length + bare.furniture.length);
  });
});

describe('other players present', () => {
  const COUNTS = [1, 4, 9, 20, 60];

  it('each get a spot, in every room, however many come', () => {
    for (const { name, template } of ROOMS) {
      for (const others of COUNTS) {
        const room = withSeating(template, { action: null, others });
        expect(room.guests.length, `${name} with ${others}`).toBeGreaterThanOrEqual(others);
      }
    }
  });

  it('are seated while there is room: first the authored spots, then seats NPCs give up, then new rows', () => {
    const cbt = getTemplate('cbt-centre');
    const authored = cbt.guests.length;
    const seatedNpcs = cbt.npcs.filter(isSeat).length;
    const withNpcSeats = withSeating(cbt, { action: null, others: authored + 2 });
    // Two NPCs got up for them.
    expect(withNpcSeats.npcs.length).toBe(cbt.npcs.length - 2);
    expect(withNpcSeats.guests.slice(0, authored + 2).every(isSeat)).toBe(true);
    // Everyone else gets a row seat with a desk and a screen.
    const crowd = withSeating(cbt, { action: null, others: authored + seatedNpcs + 6 });
    expect(crowd.guests.length).toBeGreaterThanOrEqual(authored + seatedNpcs + 6);
    expect(crowd.guests.slice(0, authored + seatedNpcs + 6).every(isSeat)).toBe(true);
    expect(crowd.furniture.filter((piece) => piece.model === 'computerScreen').length).toBe(cbt.furniture.filter((piece) => piece.model === 'computerScreen').length + 6);
    // The NPCs who stayed keep their faces.
    expect(crowd.npcs.every((npc) => npc.id !== undefined)).toBe(true);
  });

  it('the new seats sit in free floor: inside the room, clear of furniture, people and each other', () => {
    for (const { name, template } of ROOMS) {
      const others = template.guests.length + template.npcs.filter(isSeat).length + 8;
      const room = withSeating(template, { action: null, others });
      const added = room.guests.slice(template.guests.length + template.npcs.filter(isSeat).length).filter(isSeat);
      const { width: W, depth: D } = template.room;
      const solids = [...template.furniture.map(furnitureFootprint), ...template.props.map(propFootprint)].filter((box) => box !== null);
      for (const [index, spot] of added.entries()) {
        const [x, z] = feet(spot);
        expect(Math.abs(x), `${name} seat ${index}`).toBeLessThan(W / 2 - 0.3);
        expect(Math.abs(z), `${name} seat ${index}`).toBeLessThan(D / 2 - 0.3);
        const body = { minX: x - 0.2, maxX: x + 0.2, minZ: z - 0.2, maxZ: z + 0.2 };
        expect(solids.some((box) => overlaps(box, body)), `${name} seat ${index} sits in furniture`).toBe(false);
        for (const other of added.slice(index + 1)) expect(dist(feet(other), [x, z]), `${name} seats too close`).toBeGreaterThan(0.6);
        for (const person of [...room.npcs, ...template.guests]) expect(dist(feet(person), [x, z]), `${name} seat on a person`).toBeGreaterThan(0.5);
      }
    }
  });

  it('never block a door', () => {
    for (const { name, template } of ROOMS) {
      const room = withSeating(template, { action: null, others: 40 });
      const { width: W, depth: D } = template.room;
      for (const door of template.room.doors ?? []) {
        const arrival: At = door.wall === 'back' ? [door.at, -D / 2 + 0.9] : [-W / 2 + 0.9, door.at];
        // (Seats an NPC gave up are where the NPC sat; the rest are new.)
        for (const spot of room.guests.slice(template.guests.length).filter((guest) => isSeat(guest) && !template.npcs.some((npc) => dist(feet(npc), feet(guest)) < 0.05))) expect(dist(feet(spot), arrival), `${name}: seat at the door`).toBeGreaterThan(0.8);
      }
    }
  });

  it('is capped: a crowd beyond the added seats gets places to stand instead of more rows', () => {
    const cbt = getTemplate('cbt-centre');
    const room = withSeating(cbt, { action: null, others: 200 });
    expect(room.guests.length).toBeGreaterThanOrEqual(200);
    expect(room.furniture.filter((piece) => piece.model === 'computerScreen').length).toBeLessThanOrEqual(cbt.furniture.filter((piece) => piece.model === 'computerScreen').length + MAX_ADDED_SEATS);
  });

  it('leaves a room alone when nothing is needed', () => {
    const cbt = getTemplate('cbt-centre');
    expect(withSeating(cbt, { action: null, others: 0 })).toBe(cbt);
    expect(withSeating(cbt, { action: null, others: cbt.guests.length })).toBe(cbt);
  });
});
