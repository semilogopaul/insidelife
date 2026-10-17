import { DISTRICTS, VENUES, venuesOfCity } from '@insidelife/shared';
import { describe, expect, it } from 'vitest';
import { placeLayoutFor } from '../layouts/catalog';
import { resolveTemplateId } from '../templates/resolve';
import type { InteriorTemplate } from '../templates/types';

/** The one-room interior of a venue (the same lookup the world uses when you walk in). */
function roomOf(venueId: string): InteriorTemplate {
  const layout = placeLayoutFor(resolveTemplateId(venueId), venueId);
  const only = layout.rooms[0];
  if (!only || layout.rooms.length !== 1) throw new Error(`${venueId} is not a one-room venue`);
  return only.template;
}

const signLines = (template: InteriorTemplate): string => template.props.flatMap((prop) => (prop.kind === 'sign' ? prop.lines : [])).join(' | ');

describe('Abuja interiors', () => {
  it('gives every Abuja place a room that carries its own name', () => {
    for (const venue of venuesOfCity('abuja')) {
      if (venue.type === 'airport' || venue.type === 'aviation-terminal') continue;
      const room = roomOf(venue.id);
      expect(room.label, venue.id).toBe(venue.name);
      expect(signLines(room), venue.id).toContain(venue.name.toUpperCase());
    }
  });

  it('dresses the landmarks as themselves, not as another city’s place of the same type', () => {
    expect(signLines(roomOf('national-mosque'))).toContain('GOLDEN DOME');
    expect(signLines(roomOf('national-christian-centre'))).toContain('CROSS TOWER');
    expect(signLines(roomOf('national-assembly'))).toContain('SENATE');
    expect(signLines(roomOf('us-embassy-abuja'))).toContain('VISAS');
    expect(signLines(roomOf('cbn-hq'))).toContain('MONETARY POLICY');
    expect(signLines(roomOf('nnpc-towers'))).toContain('OIL');
    expect(signLines(roomOf('transcorp-hilton'))).toContain('DELEGATIONS');
    expect(signLines(roomOf('yahuza-suya'))).toContain('SUYA');
  });

  it('sells phones at Banex, a parade ground at Eagle Square and lawns in the two parks', () => {
    const banex = roomOf('banex-plaza');
    const stalls = banex.props.filter((prop) => prop.kind === 'stall');
    expect(stalls.length).toBeGreaterThan(3);
    expect(stalls.every((prop) => prop.kind === 'stall' && prop.goods === 'phones')).toBe(true);
    const eagle = roomOf('eagle-square');
    expect(eagle.room.outdoor).toBe(true);
    expect(eagle.props.filter((prop) => prop.kind === 'flag').length).toBeGreaterThanOrEqual(4);
    expect(eagle.room.floor).toBe('cement');
    for (const id of ['millennium-park', 'jabi-lake-park']) expect(roomOf(id).room.floor, id).toBe('grass');
    // The other Abuja markets sell food and cloth.
    const goods = (id: string): string[] => roomOf(id).props.flatMap((prop) => (prop.kind === 'stall' ? [prop.goods] : []));
    expect(goods('wuse-market')).not.toEqual(goods('banex-plaza'));
    expect(goods('garki-market')).toContain('fabric');
  });

  it('keeps Abuja’s places of one type apart from each other', () => {
    const byType = new Map<string, string[]>();
    for (const venue of venuesOfCity('abuja')) {
      if (venue.type === 'airport' || venue.type === 'aviation-terminal') continue;
      const room = roomOf(venue.id);
      const signature = JSON.stringify([room.room.wall, room.room.floorColor, signLines(room)]);
      byType.set(venue.type, [...(byType.get(venue.type) ?? []), signature]);
    }
    for (const [type, signatures] of byType) expect(new Set(signatures).size, type).toBe(signatures.length);
  });

  it('has only Abuja venues in Abuja’s districts (no stray Lagos venue in a capital district)', () => {
    for (const venue of VENUES) {
      const city = DISTRICTS[venue.districtId].cityId;
      if (city === 'abuja') expect(venuesOfCity('abuja').some((entry) => entry.id === venue.id)).toBe(true);
    }
  });
});
