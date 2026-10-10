import { describe, expect, it } from 'vitest';
import { hashString } from '../random/rng.js';
import { AD_FACE_GAP, AD_PLACEMENTS, adFaceEnds, adFaceGap, type AdFaceExtent } from './ad-placements.js';
import { CITY_MAP } from './city-map.js';
import { nearestRoadPoint } from './routing.js';
import type { WorldPoint } from './types.js';

/** Half the carriageway from a road's centreline (pavement and lamps start at ~4.5 m). */
const CARRIAGEWAY = 3.9;
/** An overhead face (bottom above a danfo roof) may reach this far over the carriageway's edge. */
const OVERHEAD_FROM = 4.2;
const OVERHANG = 1.4;

const FENCE_KINDS: ReadonlySet<string> = new Set(['stadium-led', 'market-banner', 'park-board']);
const doors: readonly WorldPoint[] = CITY_MAP.lots.flatMap((lot) => (lot.kind === 'venue' && lot.entrance ? [lot.entrance.position] : []));
const buildings = CITY_MAP.lots.filter((lot) => lot.kind === 'building' || lot.kind === 'home' || lot.kind === 'landmark');
const inside = (point: WorldPoint, lot: (typeof buildings)[number], margin = 0.5): boolean =>
  point.x > lot.footprint.minX + margin && point.x < lot.footprint.maxX - margin && point.z > lot.footprint.minZ + margin && point.z < lot.footprint.maxZ - margin;

describe('ad placements (bigger faces that still fit the city)', () => {
  it('keeps every spot id: bookings are tied to them (grow faces, never reshuffle the spots)', () => {
    const ids = AD_PLACEMENTS.map((spot) => spot.id).toSorted();
    expect(ids).toHaveLength(533);
    // Changing this hash means existing bookings point at spots that no longer exist: don't.
    expect(hashString(ids.join(','))).toBe(EXPECTED_ID_HASH);
  });

  it('never lets two faces touch, including the premium boards', () => {
    const faces: AdFaceExtent[] = [...AD_PLACEMENTS, ...CITY_MAP.billboards];
    for (let i = 0; i < faces.length; i++) {
      for (let j = i + 1; j < faces.length; j++) {
        const a = faces[i] as AdFaceExtent;
        const b = faces[j] as AdFaceExtent;
        if (Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) > (a.width + b.width) / 2 + 1) continue;
        // Two faces meeting at a right angle at a lot's corner wrap round it (as they always have); that's fine.
        if (Math.abs(Math.cos(a.facing - b.facing)) < 0.05) continue;
        // Stadium LEDs, market banners and park boards hang in rows along one fence: neighbours join into a strip.
        if (FENCE_KINDS.has((a as { kind?: string }).kind ?? '') && FENCE_KINDS.has((b as { kind?: string }).kind ?? '')) continue;
        expect(adFaceGap(a, b), `${JSON.stringify(a.position)} vs ${JSON.stringify(b.position)}`).toBeGreaterThanOrEqual(AD_FACE_GAP - 1e-6);
      }
    }
  });

  it('keeps low faces off the carriageway and overhead ones from reaching far over it', () => {
    for (const spot of AD_PLACEMENTS) {
      if (spot.kind === 'stadium-led' || spot.kind === 'market-banner' || spot.kind === 'park-board') continue;
      const overhead = spot.elevation >= OVERHEAD_FROM;
      for (const end of [...adFaceEnds(spot), spot.position]) {
        const snap = nearestRoadPoint(end);
        expect(snap, spot.id).not.toBeNull();
        expect(snap?.distance ?? 0, `${spot.id} (${spot.kind})`).toBeGreaterThanOrEqual(overhead ? CARRIAGEWAY - OVERHANG : CARRIAGEWAY);
      }
    }
  });

  it('keeps clear of venue doors', () => {
    for (const spot of AD_PLACEMENTS) {
      for (const point of [...adFaceEnds(spot), spot.position]) {
        for (const door of doors) expect(Math.hypot(point.x - door.x, point.z - door.z), spot.id).toBeGreaterThan(2.5);
      }
    }
  });

  it('keeps pole and gantry premium boards out of the buildings around them (no deeper than the first city)', () => {
    // Third Mainland North and Surulere have always reached 2 m over the building beside them; nothing may go further.
    for (const board of CITY_MAP.billboards) {
      if (board.mount !== 'pole' && board.mount !== 'gantry') continue;
      for (const end of adFaceEnds(board)) {
        for (const lot of buildings) expect(inside(end, lot, 2.05), `${board.slotId} end inside ${lot.id}`).toBe(false);
      }
    }
  });

  it('is bigger than the first city: about 1.5–2× the face area for each kind', () => {
    const base: Readonly<Record<string, number>> = { 'street-billboard': 9.72, 'bus-shelter': 2.16, totem: 1.69, 'stadium-led': 12, 'market-banner': 4.32, 'park-board': 6.75 };
    for (const [kind, before] of Object.entries(base)) {
      const spots = AD_PLACEMENTS.filter((spot) => spot.kind === kind);
      const largest = Math.max(...spots.map((spot) => spot.width * spot.height));
      expect(largest / before, kind).toBeGreaterThanOrEqual(1.2);
      expect(largest / before, kind).toBeLessThanOrEqual(2.05);
    }
  });
});

const EXPECTED_ID_HASH = 2_521_248_252;
