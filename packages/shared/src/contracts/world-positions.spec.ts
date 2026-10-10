import { describe, expect, it } from 'vitest';
import { decodeWorldBatch, encodeWorldBatch, expandId, shortenId, type OutgoingPosition } from './world-positions.js';
import type { WorldPlayerPositionDto } from './realtime.js';

const uuid = (n: number): string => `${(0x1a2b3c4d + n).toString(16).padStart(8, '0')}-5e6f-4a1b-8c2d-${(0x9f8e7d6c5b4a + n * 977).toString(16).padStart(12, '0')}`;

/** The pre-compact payload: a JSON array of full DTOs. */
function realisticBatch(): WorldPlayerPositionDto[] {
  return Array.from({ length: 30 }, (_, i): WorldPlayerPositionDto => ({
    characterId: uuid(i),
    handle: `lagos_player_${i}`,
    x: 1234.5678912345 + Math.sin(i * 1.7) * 40,
    z: -842.3456789012 + Math.cos(i * 2.3) * 40,
    heading: Math.sin(i * 0.77) * 3.1,
    mode: i % 10 === 0 ? 'car' : 'walk',
    speed: i % 3 === 0 ? 0 : 1.4166666666 + Math.sin(i) * 0.3,
    ...(i % 10 === 0 ? { vehicle: { model: 'sedan' as never, color: '#a1b2c3' } } : {}),
    t: 1_760_000_000_000 + i * 7,
  }));
}

describe('world position wire format', () => {
  it('round-trips uuids through the short form', () => {
    for (let i = 0; i < 50; i++) {
      const id = uuid(i * 12345);
      const short = shortenId(id);
      expect(short).toHaveLength(22);
      expect(expandId(short)).toBe(id);
    }
    expect(shortenId('ada')).toBe('ada');
    expect(expandId('ada')).toBe('ada');
  });

  it('decodes to the same positions within quantisation, keeping handle and car look from meta rows', () => {
    const batch = realisticBatch();
    const t = batch[29]!.t + 100;
    const decoded = decodeWorldBatch(encodeWorldBatch(batch.map((position) => ({ position, withMeta: true })), t));
    expect(decoded).toHaveLength(30);
    decoded.forEach((got, i) => {
      const want = batch[i]!;
      expect(got.characterId).toBe(want.characterId);
      expect(got.handle).toBe(want.handle);
      expect(got.mode).toBe(want.mode);
      expect(got.x).toBeCloseTo(want.x, 1);
      expect(got.z).toBeCloseTo(want.z, 1);
      const turn = (((got.heading - want.heading) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
      expect(Math.abs(turn)).toBeLessThan(0.006);
      expect(got.speed).toBeCloseTo(want.speed, 1);
      expect(Math.abs(got.t - want.t)).toBeLessThanOrEqual(5);
      expect(got.vehicle).toEqual(want.vehicle);
    });
  });

  it('leaves handle empty and vehicle off on rows without meta, and skips malformed rows', () => {
    const [position] = realisticBatch();
    const encoded = encodeWorldBatch([{ position: position!, withMeta: false }], position!.t);
    const [row] = decodeWorldBatch(encoded);
    expect(row!.handle).toBe('');
    expect(row!.vehicle).toBeUndefined();
    expect(decodeWorldBatch([1, 0, 0, 'short', [1, 2, 'x', 4, 5]] as never)).toEqual([]);
    expect(decodeWorldBatch([1, 0, 0, shortenId(uuid(1)), [1, 2, 'x', 4, 5]] as never)).toEqual([]);
    expect(decodeWorldBatch(null as never)).toEqual([]);
  });

  it('is at least 4x smaller than the old JSON for a 30-player batch (steady state and with meta)', () => {
    const batch = realisticBatch();
    const t = batch[29]!.t + 100;
    const before = JSON.stringify(batch).length;
    const items = (every: (i: number) => boolean): OutgoingPosition[] => batch.map((position, i) => ({ position, withMeta: every(i) }));
    const steady = JSON.stringify(encodeWorldBatch(items(() => false), t)).length;
    const occasional = JSON.stringify(encodeWorldBatch(items((i) => i % 20 === 0), t)).length;
    const everyone = JSON.stringify(encodeWorldBatch(items(() => true), t)).length;
    expect(before / steady).toBeGreaterThanOrEqual(4);
    expect(before / occasional).toBeGreaterThanOrEqual(4);
    expect(before / everyone).toBeGreaterThanOrEqual(2);
  });
});
