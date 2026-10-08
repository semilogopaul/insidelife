import { describe, expect, it } from 'vitest';
import { INTERPOLATION_DELAY_MS, InterpolationBuffer, type RemotePose } from '../players/interpolation';

const pose = (): RemotePose => ({ x: 0, z: 0, heading: 0, speed: 0, mode: 'walk' });

describe('interpolation buffer', () => {
  it('renders ~150 ms behind the server, between the two samples around that time', () => {
    const buffer = new InterpolationBuffer();
    buffer.push(1000, 0, 0, 0, 4, 'walk');
    buffer.push(1250, 1, 0, 0, 4, 'walk');
    buffer.push(1500, 2, 0, 0, 4, 'walk');
    const out = pose();
    expect(buffer.sample(1375 + INTERPOLATION_DELAY_MS, out)).toBe(true);
    expect(out.x).toBeCloseTo(1.5);
  });

  it('turns along the short way round', () => {
    const buffer = new InterpolationBuffer();
    buffer.push(0, 0, 0, Math.PI - 0.1, 0, 'car');
    buffer.push(100, 0, 0, -Math.PI + 0.1, 0, 'car');
    const out = pose();
    buffer.sample(50, out, 0);
    expect(Math.abs(out.heading)).toBeGreaterThan(Math.PI - 0.11);
    expect(out.mode).toBe('car');
  });

  it('extrapolates along the heading for a short while, then holds', () => {
    const buffer = new InterpolationBuffer();
    buffer.push(0, 0, 0, 0, 0, 'walk');
    buffer.push(250, 1, 0, Math.PI / 2, 4, 'walk');
    const out = pose();
    buffer.sample(250 + 200, out, 0);
    expect(out.x).toBeCloseTo(1);
    expect(out.z).toBeCloseTo(0.8);
    buffer.sample(250 + 5000, out, 0);
    expect(out.z).toBeCloseTo(4 * 0.6);
    expect(out.speed).toBe(0);
  });

  it('drops out-of-order and duplicate samples and keeps a bounded history', () => {
    const buffer = new InterpolationBuffer();
    buffer.push(500, 5, 0, 0, 0, 'walk');
    buffer.push(400, 99, 0, 0, 0, 'walk');
    buffer.push(500, 99, 0, 0, 0, 'walk');
    expect(buffer.count).toBe(1);
    for (let i = 1; i <= 20; i++) buffer.push(500 + i * 100, i, 0, 0, 0, 'walk');
    expect(buffer.count).toBe(8);
    expect(buffer.latest).toBe(2500);
  });
});
