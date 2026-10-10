import { describe, expect, it } from 'vitest';
import { decodeWorldBatch, encodeWorldBatch, type WorldPlayerPositionDto } from '@insidelife/shared';
import { RemotePlayers } from '../players/remote-players';
import { handleOf } from '../players/presence-directory';

const ID = '3f2b8c1e-5d4a-4e7b-9a60-1c2d3e4f5a6b';
const sample = (t: number, x: number, extra: Partial<WorldPlayerPositionDto> = {}): WorldPlayerPositionDto => ({
  characterId: ID,
  handle: 'tolu_b',
  x,
  z: -250.123,
  heading: -2.5,
  mode: 'walk',
  speed: 1.4,
  t,
  ...extra,
});

describe('compact world:players feed', () => {
  it('decodes into remote players that interpolate between batches and keep the handle sent earlier', () => {
    const remotes = new RemotePlayers();
    const t0 = 1_760_000_000_000;
    // The first batch carries the handle; later ones don't.
    remotes.ingest(decodeWorldBatch(encodeWorldBatch([{ position: sample(t0, 100), withMeta: true }], t0 + 40)), 0);
    remotes.ingest(decodeWorldBatch(encodeWorldBatch([{ position: sample(t0 + 250, 101), withMeta: false }], t0 + 290)), 250);
    remotes.ingest(decodeWorldBatch(encodeWorldBatch([{ position: sample(t0 + 500, 102), withMeta: false }], t0 + 540)), 500);

    expect(handleOf(ID)).toBe('tolu_b');
    const player = remotes.players.get(ID)!;
    expect(player.buffer.count).toBe(3);
    remotes.update(t0 + 375 + 150, 500, 0, 0);
    expect(player.pose.x).toBeCloseTo(101.5, 0);
    // -2.5 rad arrives wrapped to [0, 2π) and still faces the same way.
    expect(Math.cos(player.pose.heading)).toBeCloseTo(Math.cos(-2.5), 1);
    expect(Math.sin(player.pose.heading)).toBeCloseTo(Math.sin(-2.5), 1);
  });
});
