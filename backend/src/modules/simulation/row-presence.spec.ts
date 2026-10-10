import type { EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { RowPresence, type RowProbe } from './row-presence.js';

const cars: RowProbe = { key: 'test:cars', table: 'owned_vehicles', where: 'character_id = $1' };
const jobs: RowProbe = { key: 'test:jobs', table: 'employments', where: 'character_id = $1' };
const stranger: RowProbe = { key: 'test:other', table: 'other', where: 'character_id = $1' };

function presence(answer: Record<string, boolean>) {
  const query = vi.fn(async (_sql: string, _params: unknown[]) => [answer]);
  const manager = { query } as unknown as EntityManager;
  return { rows: new RowPresence(manager, 'char-1', [cars, jobs]), query };
}

describe('RowPresence', () => {
  it('answers every probe with one query, asked only when a guarded load first needs it', async () => {
    const { rows, query } = presence({ p0: false, p1: true });
    expect(query).not.toHaveBeenCalled();
    expect(await rows.mayHave(cars)).toBe(false);
    expect(await rows.mayHave(jobs)).toBe(true);
    expect(await rows.mayHave(cars)).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]![0]).toBe(
      'SELECT EXISTS (SELECT 1 FROM owned_vehicles WHERE character_id = $1) AS p0, EXISTS (SELECT 1 FROM employments WHERE character_id = $1) AS p1',
    );
    expect(query.mock.calls[0]![1]).toEqual(['char-1']);
  });

  it('shares one probe query between loads asking at the same time', async () => {
    const { rows, query } = presence({ p0: false, p1: false });
    expect(await Promise.all([rows.mayHave(cars), rows.mayHave(jobs)])).toEqual([false, false]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('says "maybe" for a probe it was not given, without querying', async () => {
    const { rows, query } = presence({ p0: false, p1: false });
    expect(await rows.mayHave(stranger)).toBe(true);
    expect(query).not.toHaveBeenCalled();
  });

  it('a write naming a probed table makes its probe "maybe" again; reads and other tables change nothing', async () => {
    const { rows } = presence({ p0: false, p1: false });
    await rows.mayHave(cars);
    rows.noteQuery('SELECT * FROM "owned_vehicles" WHERE character_id = $1');
    rows.noteQuery('UPDATE "characters" SET "needs" = $1 WHERE "id" = $2');
    rows.noteQuery('START TRANSACTION');
    expect(await rows.mayHave(cars)).toBe(false);
    rows.noteQuery('INSERT INTO "owned_vehicles"("character_id") VALUES ($1)');
    expect(await rows.mayHave(cars)).toBe(true);
    expect(await rows.mayHave(jobs)).toBe(false);
    rows.noteQuery('WITH moved AS (DELETE FROM employments WHERE id = $1 RETURNING id) SELECT id FROM moved');
    expect(await rows.mayHave(jobs)).toBe(true);
  });

  it('treats a missing answer as "maybe" (never skips a load on doubt)', async () => {
    const { rows } = presence({});
    expect(await rows.mayHave(cars)).toBe(true);
  });

  it('notes nothing before the probe ran (the probe itself will see earlier writes)', async () => {
    const { rows, query } = presence({ p0: false, p1: false });
    rows.noteQuery('INSERT INTO "owned_vehicles"("character_id") VALUES ($1)');
    expect(query).not.toHaveBeenCalled();
    expect(await rows.mayHave(cars)).toBe(false);
  });
});
