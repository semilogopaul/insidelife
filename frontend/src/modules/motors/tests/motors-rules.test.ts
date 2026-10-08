import { describe, expect, it } from 'vitest';
import { VEHICLES } from '@insidelife/shared';
import {
  carShape,
  conditionWord,
  filterCatalogue,
  performanceBars,
  purchaseLines,
} from '../services/motors-rules';

describe('performance bars', () => {
  it('normalises every bar to 0-1 with quicker 0-100 scoring higher', () => {
    const benz = performanceBars({ topSpeedKmh: 240, zeroToHundredSeconds: 6, handling: 0.8, braking: 0.8 });
    const canter = performanceBars({
      topSpeedKmh: 120,
      zeroToHundredSeconds: 20,
      handling: 0.35,
      braking: 0.45,
    });
    for (const bar of [...benz, ...canter]) {
      expect(bar.ratio).toBeGreaterThanOrEqual(0);
      expect(bar.ratio).toBeLessThanOrEqual(1);
    }
    const accel = (bars: typeof benz) => bars.find((bar) => bar.key === 'zeroToHundredSeconds')?.ratio ?? 0;
    expect(accel(benz)).toBeGreaterThan(accel(canter));
    expect(benz[0]?.value).toBe('240 km/h');
    expect(benz[1]?.value).toBe('6.0 s');
  });

  it('stays within bounds for the whole catalogue', () => {
    for (const vehicle of VEHICLES)
      for (const bar of performanceBars(vehicle.performance)) expect(bar.ratio).toBeGreaterThan(0);
  });
});

describe('dealer helpers', () => {
  const entry = (id: string, segment: 'economy' | 'luxury', price: number) => ({
    vehicle: { id, segment },
    price,
  });
  const lot = [
    entry('g-wagon', 'luxury', 250_000_000),
    entry('picanto', 'economy', 3_500_000),
    entry('taxi', 'economy', 3_200_000),
  ];

  it('filters by segment and budget, cheapest first', () => {
    expect(filterCatalogue(lot, 'all', null).map((x) => x.vehicle.id)).toEqual([
      'taxi',
      'picanto',
      'g-wagon',
    ]);
    expect(filterCatalogue(lot, 'luxury', null).map((x) => x.vehicle.id)).toEqual(['g-wagon']);
    expect(filterCatalogue(lot, 'all', 3_400_000).map((x) => x.vehicle.id)).toEqual(['taxi']);
  });

  it('adds delivery only when ordering remotely', () => {
    expect(purchaseLines(3_150_000, 49_200, false).total).toBe(3_199_200);
    expect(purchaseLines(3_150_000, 49_200, true)).toMatchObject({
      total: 3_150_000,
      lines: [{ label: 'Car', amount: 3_150_000 }],
    });
  });

  it('picks a silhouette per model and describes condition', () => {
    expect(carShape('suv-luxury')).toBe('suv');
    expect(carShape('taxi')).toBe('sedan');
    expect(carShape('truck')).toBe('pickup');
    expect(conditionWord(5)).toBe('Won’t start');
    expect(conditionWord(95)).toBe('Mint');
  });
});
