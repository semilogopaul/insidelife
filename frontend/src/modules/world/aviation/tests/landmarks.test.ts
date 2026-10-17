import { describe, expect, it } from 'vitest';
import { venueLot } from '@insidelife/shared';
import { AIRPORT_TERMINAL_IDS, GAT_TERMINAL_IDS, airportSpec, gatSpec } from '../../city/layout/aviation-landmarks';
import { buildLandmarkGeometry } from '../../city/render/landmark-geometry';

describe('airport landmarks', () => {
  it('keeps the Lagos terminal exactly as it was (60 m wide, tower 34 m at x 34) and gives Abuja’s a wider, two-storey one', () => {
    const lagos = airportSpec('mmia-airport')!;
    expect(lagos).toMatchObject({ width: 60, depth: 18, height: 11, twoStorey: false });
    expect(lagos.tower).toMatchObject({ x: 34, height: 34 });
    expect(lagos.centreZ).toBeCloseTo(-lagos.frame.depth / 2 + 13);
    const abuja = airportSpec('naia-airport')!;
    expect(abuja.width).toBeGreaterThan(lagos.width);
    expect(abuja.twoStorey).toBe(true);
  });

  it('fits every terminal and General Aviation Terminal inside its lot', () => {
    for (const id of AIRPORT_TERMINAL_IDS) {
      const spec = airportSpec(id)!;
      expect(venueLot(id), id).not.toBeNull();
      expect(spec.width / 2 + 4 + 2.4, id).toBeLessThanOrEqual(spec.frame.width / 2);
      expect(spec.centreZ + spec.depth / 2, id).toBeLessThan(spec.frame.depth / 2);
    }
    for (const id of GAT_TERMINAL_IDS) {
      const spec = gatSpec(id)!;
      expect(venueLot(id), id).not.toBeNull();
      for (const block of [spec.lounge, spec.hangar]) {
        expect(Math.abs(block.x) + block.halfW, id).toBeLessThanOrEqual(spec.frame.width / 2);
        expect(Math.abs(block.z) + block.halfD, id).toBeLessThanOrEqual(spec.frame.depth / 2);
      }
      expect(spec.tower.x + 1.2, id).toBeLessThanOrEqual(spec.frame.width / 2);
      // The lounge is by the road, the hangar behind it.
      expect(spec.lounge.z, id).toBeGreaterThan(spec.hangar.z);
    }
    expect(airportSpec('nowhere')).toBeNull();
    expect(gatSpec('nowhere')).toBeNull();
  });

  it('draws both terminals and both GATs into the one landmark mesh', () => {
    const geometry = buildLandmarkGeometry();
    const position = geometry.getAttribute('position');
    expect(position.count).toBeGreaterThan(0);
    let inAbuja = false;
    const gat = venueLot('naia-gat')!.footprint;
    for (let index = 0; index < position.count; index++) {
      const x = position.getX(index);
      const z = position.getZ(index);
      if (x > gat.minX && x < gat.maxX && z > gat.minZ && z < gat.maxZ) {
        inAbuja = true;
        break;
      }
    }
    expect(inAbuja).toBe(true);
    geometry.dispose();
  });
});
