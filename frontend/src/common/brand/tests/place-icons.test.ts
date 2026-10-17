import { describe, expect, it } from 'vitest';
import { CITY_MAP, VENUE_TYPES, VENUES, findVenue, type LotArchetype } from '@insidelife/shared';
import {
  PICTOGRAMS,
  PLACE_KINDS,
  PLACE_STYLES,
  placeKindOfArchetype,
  placeKindOfVenueType,
  propertyPlaceKind,
  venuePlaceKind,
} from '../place-icons';

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const channel = (index: number): number => {
    const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

const venue = (id: string) => {
  const found = findVenue(id);
  if (!found) throw new Error(`no venue ${id}`);
  return found;
};

describe('place pictograms', () => {
  it('gives every kind a label, a drawn pictogram and a legible colour pair', () => {
    for (const kind of PLACE_KINDS) {
      const style = PLACE_STYLES[kind];
      expect(style.label, kind).not.toBe('');
      const layers = PICTOGRAMS[style.pictogram];
      expect(layers.length, kind).toBeGreaterThan(0);
      for (const layer of layers) expect(layer.d, kind).toMatch(/^M[\d.\s,a-zA-Z-]+$/);
      // Pictograms are informative graphics: at least 4.5:1 so they hold up at minimap size.
      expect(contrast(style.color, style.ink), kind).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('maps every venue type and lot archetype to a kind', () => {
    for (const type of VENUE_TYPES) expect(PLACE_KINDS).toContain(placeKindOfVenueType(type));
    const archetypes = new Set(CITY_MAP.lots.flatMap((lot) => (lot.archetype ? [lot.archetype] : [])));
    for (const archetype of archetypes as Set<LotArchetype>) expect(PLACE_KINDS).toContain(placeKindOfArchetype(archetype));
    for (const place of VENUES) expect(PLACE_KINDS).toContain(venuePlaceKind(place));
  });

  it('shows what a place is: its type, or its landmark building', () => {
    expect(venuePlaceKind(venue('shitta-amala'))).toBe('food');
    expect(venuePlaceKind(venue('unilag'))).toBe('university');
    expect(venuePlaceKind(venue('cbt-yaba'))).toBe('exam-centre');
    // The National Stadium is a "park" venue and Eko Hotel an event centre, but the map shows their buildings.
    expect(venuePlaceKind(venue('national-stadium'))).toBe('stadium');
    expect(venuePlaceKind(venue('eko-hotel'))).toBe('hotel');
    expect(venuePlaceKind(venue('eko-atlantic'))).toBe('office-tower');
    expect(venuePlaceKind(venue('lasustech'))).toBe('university');
  });

  it('marks your own property by what stands on it', () => {
    expect(propertyPlaceKind({ stage: 'built', livedIn: true })).toBe('home');
    expect(propertyPlaceKind({ stage: 'built', livedIn: false })).toBe('house');
    expect(propertyPlaceKind({ stage: 'construction', livedIn: false })).toBe('building-site');
    expect(propertyPlaceKind({ stage: 'land', livedIn: false })).toBe('land');
  });
});
