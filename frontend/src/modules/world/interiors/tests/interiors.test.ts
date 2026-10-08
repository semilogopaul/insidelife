import { describe, expect, it } from 'vitest';
import { VENUES, VENUE_TYPES, homeLocationId } from '@insidelife/shared';
import { dollhouseFraming } from '../components/DollhouseCamera';
import { daylightAt } from '../components/InteriorLighting';
import { packSigns } from '../props/signs';
import { TEMPLATES } from '../templates/registry';
import { INTERIOR_TEMPLATE_IDS, homeTemplateFor, isNepaOff, resolveTemplateId } from '../templates/resolve';
import { pickPlayerSpot, placeAt } from '../templates/spots';
import type { Spot } from '../templates/types';

describe('template resolution', () => {
  it('maps every venue in the catalog to an authored template', () => {
    for (const venue of VENUES) {
      const id = resolveTemplateId(venue.id);
      expect(TEMPLATES[id], `${venue.id} → ${id}`).toBeDefined();
    }
    expect(VENUE_TYPES.length).toBeGreaterThan(20);
  });

  it('authors every template id', () => {
    for (const id of INTERIOR_TEMPLATE_IDS) expect(TEMPLATES[id].id).toBe(id);
  });

  it('picks a home interior from the home summary', () => {
    const home = homeLocationId('c1');
    expect(resolveTemplateId(home, { label: 'Family room (face-me-I-face-you), Mushin', ownership: 'family', comfort: 0 })).toBe('home-face-me');
    expect(resolveTemplateId(home, { label: 'Self-contain, Yaba', ownership: 'rented', comfort: 3 })).toBe('home-self-contain');
    expect(resolveTemplateId(home, { label: 'Family flat, Surulere', ownership: 'family', comfort: 3 })).toBe('home-flat');
    expect(resolveTemplateId(home, { label: 'Family house, Ikeja', ownership: 'family', comfort: 6 })).toBe('home-family');
    expect(resolveTemplateId(home, { label: 'Family duplex, Lekki', ownership: 'family', comfort: 12 })).toBe('home-duplex');
    expect(resolveTemplateId(home, { label: 'Mansion, Banana Island plot', ownership: 'owned', comfort: 15 })).toBe('home-mansion');
    expect(homeTemplateFor({ label: 'Room 12, Moremi Hall', ownership: 'hostel', comfort: 1 })).toBe('home-hostel');
    expect(homeTemplateFor(null)).toBe('home-family');
  });

  it('resolves venues by type and accepts template ids directly (dev)', () => {
    expect(resolveTemplateId('the-vault')).toBe('club');
    expect(resolveTemplateId('luth')).toBe('hospital-ward');
    expect(resolveTemplateId('unilag')).toBe('campus');
    expect(resolveTemplateId('shitta-amala')).toBe('buka');
    expect(resolveTemplateId('event-centre')).toBe('event-centre');
    expect(resolveTemplateId('nowhere')).toBe('home-family');
  });
});

describe('template layouts', () => {
  const inside = (template: (typeof TEMPLATES)[keyof typeof TEMPLATES], spot: Spot): boolean => {
    const { position } = placeAt(spot);
    return Math.abs(position[0]) <= template.room.width / 2 && Math.abs(position[2]) <= template.room.depth / 2;
  };

  it('keeps every player, NPC and guest spot inside the room', () => {
    for (const template of Object.values(TEMPLATES)) {
      for (const spot of Object.values(template.player)) if (spot) expect(inside(template, spot), `${template.id} player`).toBe(true);
      template.npcs.forEach((spot, i) => expect(inside(template, spot), `${template.id} npc ${i}`).toBe(true));
      template.guests.forEach((spot, i) => expect(inside(template, spot), `${template.id} guest ${i}`).toBe(true));
    }
  });

  it('gives every template a default spot and a guest spot', () => {
    for (const template of Object.values(TEMPLATES)) {
      expect(template.player.default, template.id).toBeDefined();
      expect(template.guests.length, template.id).toBeGreaterThan(0);
    }
  });

  it('every home has a bed (or couch) to sleep on', () => {
    for (const id of INTERIOR_TEMPLATE_IDS.filter((value) => value.startsWith('home-'))) expect(TEMPLATES[id].player.sleep, id).toBeDefined();
  });

  it('falls back sensibly when a spot is missing', () => {
    const spots = { default: { at: [0, 0], animation: 'idle' }, sit: { at: [1, 1], animation: 'sit', stance: 'sit' } } as const;
    expect(pickPlayerSpot(spots, 'eat')).toBe(spots.sit);
    expect(pickPlayerSpot(spots, 'dance')).toBe(spots.default);
    expect(placeAt({ at: [1, 0.4, 2], rot: 90, animation: 'sleep' })).toEqual({ position: [1, 0.4, 2], rotationY: Math.PI / 2 });
  });
});

describe('lighting & camera', () => {
  it('daylight peaks at noon and is zero at night', () => {
    expect(daylightAt(12)).toBeCloseTo(1);
    expect(daylightAt(2)).toBe(0);
    expect(daylightAt(22)).toBe(0);
  });

  it('NEPA cuts are deterministic and only at night', () => {
    expect(isNepaOff('home:1', 10, 12)).toBe(false);
    expect(isNepaOff('home:1', 10, 21)).toBe(isNepaOff('home:1', 10, 21));
    const nights = Array.from({ length: 200 }, (_, day) => isNepaOff('home:abc', day, 21)).filter(Boolean).length;
    expect(nights).toBeGreaterThan(30);
    expect(nights).toBeLessThan(110);
  });

  it('pulls the camera back on narrow screens', () => {
    const wide = dollhouseFraming(8, 6, 3, 38, 16 / 9);
    const phone = dollhouseFraming(8, 6, 3, 38, 390 / 844);
    expect(phone.distance).toBeGreaterThan(wide.distance);
  });
});

describe('sign atlas packing', () => {
  it('packs signs without overlap into a power-of-two atlas', () => {
    const sign = (w: number, h: number) => ({ kind: 'sign', at: [0, 0], size: [w, h], lines: ['X'], bg: '#000', fg: '#fff' }) as const;
    const { slots, height } = packSigns([sign(3, 1), sign(2, 0.5), sign(1, 1), sign(4, 0.4), sign(0.5, 0.5)]);
    expect(Math.log2(height) % 1).toBe(0);
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i]!;
        const b = slots[j]!;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
    }
  });
});
