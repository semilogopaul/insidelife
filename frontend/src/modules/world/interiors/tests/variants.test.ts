import { VENUES } from '@insidelife/shared';
import { describe, expect, it } from 'vitest';
import { actionSpot } from '../hotspots/action-spots';
import { placeLayoutFor } from '../layouts/catalog';
import { getTemplate } from '../templates/registry';
import { INTERIOR_TEMPLATE_IDS, resolveTemplateId } from '../templates/resolve';
import type { InteriorTemplate } from '../templates/types';
import { nameBoards, shiftHue, venueTemplate } from '../templates/variants';
import { buildRoomPhysics } from '../walk/home-walk-runtime';
import { approachPoint } from '../walk/nav-grid';

/** Every venue with its one-room interior (the showcase places have rooms of their own: `showcase.test.ts`). */
const ROOMS = VENUES.filter((venue) => venue.type !== 'home').flatMap((venue) => {
  const id = resolveTemplateId(venue.id);
  const layout = placeLayoutFor(id, venue.id);
  const only = layout.rooms.length === 1 ? layout.rooms[0] : undefined;
  return only ? [{ venue, id, template: only.template }] : [];
});

/** What you'd see of a room at a glance: its colours, its boards and what's in it. */
const look = (template: InteriorTemplate): string =>
  JSON.stringify([template.room.wall, template.room.floor, template.room.floorColor, template.room.curtain, template.props.map((prop) => (prop.kind === 'sign' ? [prop.lines, prop.bg, prop.fg] : [prop.kind, prop.at])), template.furniture.map((piece) => [piece.model, piece.at])]);

describe('venue interiors', () => {
  it('has a name board in every one-room venue type', () => {
    for (const id of INTERIOR_TEMPLATE_IDS) {
      if (id.startsWith('home-') || id.startsWith('aircraft-') || placeLayoutFor(id).rooms.length > 1) continue;
      expect(nameBoards(getTemplate(id)).length, id).toBeGreaterThan(0);
    }
  });

  it('shows the name of the venue you entered, not another’s', () => {
    expect(ROOMS.length).toBeGreaterThan(40);
    for (const { venue, template } of ROOMS) {
      const boards = nameBoards(template);
      expect(boards, venue.id).toContain(venue.name.toUpperCase());
      expect(template.label, venue.id).toBe(venue.name);
    }
  });

  it('never carries another venue’s name on its boards', () => {
    const names = new Set(VENUES.map((venue) => venue.name.toUpperCase()));
    // Names the old templates hard-coded ("THE VAULT" in Quilox, "BALOGUN MARKET" in Computer Village).
    const borrowed = ['THE VAULT', 'BALOGUN MARKET', 'SHITTA AMALA', 'KOWRY', 'FREEDOM PARK', 'GRACE ASSEMBLY', 'YABA TECH HUB', 'LEKKI HOMES & LAND', 'IRON PARADISE'];
    for (const { venue, template } of ROOMS) {
      const shown = template.props.flatMap((prop) => (prop.kind === 'sign' ? prop.lines : []));
      for (const name of borrowed) {
        if (venue.name.toUpperCase() === name) continue;
        expect(shown, `${venue.id} shows ${name}`).not.toContain(name);
      }
      expect(names.size).toBeGreaterThan(0);
    }
  });

  it('looks different from every other venue of its type', () => {
    const byType = new Map<string, Array<{ readonly id: string; readonly look: string }>>();
    for (const { venue, template } of ROOMS) byType.set(venue.type, [...(byType.get(venue.type) ?? []), { id: venue.id, look: look(template) }]);
    for (const [type, rooms] of byType) {
      expect(new Set(rooms.map((room) => room.look)).size, `${type}: ${rooms.map((room) => room.id).join(', ')}`).toBe(rooms.length);
    }
  });

  it('gives Computer Village a market of phone stalls and Freedom Park an open-air park of its own', () => {
    const village = ROOMS.find(({ venue }) => venue.id === 'computer-village')?.template;
    const park = ROOMS.find(({ venue }) => venue.id === 'freedom-park')?.template;
    if (!village || !park) throw new Error('venues');
    expect(village.id).toBe('market');
    expect(park.id).toBe('park');
    const stalls = village.props.filter((prop) => prop.kind === 'stall');
    expect(stalls.length).toBeGreaterThan(3);
    expect(stalls.every((prop) => prop.kind === 'stall' && prop.goods === 'phones')).toBe(true);
    expect(village.props.some((prop) => prop.kind === 'generator')).toBe(true);
    expect(village.room.floor).toBe('asphalt');
    expect(village.props.some((prop) => prop.kind === 'sign' && prop.lines.join(' ').includes('COMPUTER VILLAGE'))).toBe(true);
    expect(park.room.outdoor).toBe(true);
    expect(park.room.floor).toBe('grass');
    expect(park.props.some((prop) => prop.kind === 'arch')).toBe(true);
    expect(park.props.some((prop) => prop.kind === 'stall')).toBe(false);
    // The other markets sell something else.
    const goods = (id: string): string[] => (ROOMS.find(({ venue }) => venue.id === id)?.template.props ?? []).flatMap((prop) => (prop.kind === 'stall' ? [prop.goods] : []));
    expect(goods('mushin-market')).not.toEqual(goods('computer-village'));
    expect(goods('balogun-market')).toContain('fabric');
  });

  it('keeps each venue playable: every spot is reachable and nobody stands in the furniture', () => {
    for (const { venue, template } of ROOMS) {
      const physics = buildRoomPhysics(template, template.npcs.map((npc) => [npc.at[0], npc.at[npc.at.length - 1] as number] as const));
      const start = template.player.default?.at ?? [0, 0];
      const from = physics.nav.nearestFree(start[0] as number, start[start.length - 1] as number, 2) ?? [0, 0];
      for (const [animation, spot] of Object.entries(template.player)) {
        if (!spot) continue;
        const approach = approachPoint(physics.nav, spot);
        expect(approach, `${venue.id}: approach ${animation}`).not.toBeNull();
        if (approach) expect(physics.nav.findPath(from, approach), `${venue.id}: walk to ${animation}`).not.toBeNull();
      }
      const spot = actionSpot(template, { animation: 'idle' });
      expect(physics.nav.nearestFree(spot.at[0] as number, spot.at[spot.at.length - 1] as number, 1.5), `${venue.id}: default`).not.toBeNull();
    }
  });

  it('leaves unknown places alone', () => {
    const market = getTemplate('market');
    expect(venueTemplate(market, 'nowhere')).toBe(market);
    expect(venueTemplate(market, undefined)).toBe(market);
  });
});

describe('shiftHue', () => {
  it('turns a colour round the wheel, keeping it a colour', () => {
    expect(shiftHue('#ff0000', 120)).toBe('#00ff00');
    expect(shiftHue('#e8eef2', 90)).not.toBe('#e8eef2');
    expect(shiftHue('#e8eef2', 0)).toMatch(/^#[0-9a-f]{6}$/);
    expect(shiftHue('rebeccapurple', 90)).toBe('rebeccapurple');
  });
});
