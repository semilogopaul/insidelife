import { describe, expect, it } from 'vitest';
import { buildLine, nearestIndex, niceStep, niceTicks, scaleLinear } from '../services/chart';

const box = { width: 300, height: 120, top: 10, right: 50, bottom: 20, left: 0 };

describe('scales and ticks', () => {
  it('maps linearly and centres a flat domain', () => {
    expect(scaleLinear(5, [0, 10], [0, 100])).toBe(50);
    expect(scaleLinear(3, [3, 3], [0, 100])).toBe(50);
  });

  it('picks 1/2/2.5/5 steps', () => {
    expect(niceStep(10, 4)).toBe(2.5);
    expect(niceStep(800, 4)).toBe(200);
    expect(niceStep(0.9, 4)).toBe(0.25);
  });

  it('builds round ticks that cover the data', () => {
    expect(niceTicks(18.4, 25.1, 4)).toEqual([18, 20, 22, 24, 26]);
    const ticks = niceTicks(0.1, 0.3, 4);
    expect(ticks[0]).toBeLessThanOrEqual(0.1);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(0.3);
    expect(ticks.every((tick) => Number.isFinite(tick) && String(tick).length < 8)).toBe(true);
    expect(niceTicks(5, 5).length).toBeGreaterThan(1);
  });
});

describe('buildLine', () => {
  it('draws oldest left to newest right inside the plot box', () => {
    const geometry = buildLine([20, 22, 19, 24], box);
    expect(geometry).not.toBeNull();
    const points = geometry!.points;
    expect(points[0]!.x).toBe(0);
    expect(points.at(-1)!.x).toBe(250);
    expect(geometry!.line.startsWith('M0,')).toBe(true);
    expect(geometry!.line.match(/L/g)).toHaveLength(3);
    expect(geometry!.area.endsWith('Z')).toBe(true);
    for (const point of points) {
      expect(point.y).toBeGreaterThanOrEqual(box.top);
      expect(point.y).toBeLessThanOrEqual(box.height - box.bottom);
    }
  });

  it('puts higher prices higher on screen and reports the extremes', () => {
    const geometry = buildLine([10, 30, 20], box)!;
    expect(geometry.points[1]!.y).toBeLessThan(geometry.points[0]!.y);
    expect(geometry.max).toEqual({ index: 1, value: 30 });
    expect(geometry.min).toEqual({ index: 0, value: 10 });
    expect(geometry.domain[0]).toBeLessThanOrEqual(10);
    expect(geometry.domain[1]).toBeGreaterThanOrEqual(30);
  });

  it('handles empty and single-point series', () => {
    expect(buildLine([], box)).toBeNull();
    const single = buildLine([42], box)!;
    expect(single.points).toHaveLength(1);
    expect(single.points[0]!.x).toBe(125);
  });
});

describe('nearestIndex', () => {
  it('snaps the pointer to the closest day and clamps at the edges', () => {
    expect(nearestIndex(0, 90, box)).toBe(0);
    expect(nearestIndex(250, 90, box)).toBe(89);
    expect(nearestIndex(125, 3, box)).toBe(1);
    expect(nearestIndex(-40, 90, box)).toBe(0);
    expect(nearestIndex(999, 90, box)).toBe(89);
    expect(nearestIndex(100, 1, box)).toBe(0);
  });
});
