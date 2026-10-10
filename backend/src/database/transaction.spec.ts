import type { DataSource, EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { withTransaction } from './transaction.js';

function dataSource(level: string | Error) {
  const transaction = vi.fn(async (...args: unknown[]) => {
    const work = args.at(-1) as (manager: EntityManager) => Promise<unknown>;
    return work({} as EntityManager);
  });
  const query = vi.fn(async () => {
    if (level instanceof Error) throw level;
    return [{ level }];
  });
  return { source: { transaction, query } as unknown as DataSource, transaction, query };
}

describe('withTransaction', () => {
  it('skips the SET TRANSACTION round trip when the server already defaults to READ COMMITTED (asked once)', async () => {
    const { source, transaction, query } = dataSource('read committed');
    expect(await withTransaction(source, async () => 'done')).toBe('done');
    await withTransaction(source, async () => 'again');
    expect(query).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenNthCalledWith(1, expect.any(Function));
    expect(transaction).toHaveBeenNthCalledWith(2, expect.any(Function));
  });

  it('asks for READ COMMITTED explicitly when the server defaults to something else', async () => {
    const { source, transaction } = dataSource('repeatable read');
    await withTransaction(source, async () => undefined);
    expect(transaction).toHaveBeenCalledWith('READ COMMITTED', expect.any(Function));
  });

  it('asks explicitly when the setting can’t be read, and asks the server again next time', async () => {
    const { source, transaction, query } = dataSource(new Error('starting up'));
    await withTransaction(source, async () => undefined);
    await withTransaction(source, async () => undefined);
    expect(transaction).toHaveBeenCalledWith('READ COMMITTED', expect.any(Function));
    expect(query).toHaveBeenCalledTimes(2);
  });
});
