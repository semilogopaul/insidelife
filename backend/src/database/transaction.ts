import type { DataSource, EntityManager } from 'typeorm';

/** Postgres error codes that are safe to retry from scratch. */
const RETRYABLE_CODES = new Set(['40001', '40P01', '55P03']);

const isRetryable = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'driverError' in error &&
  typeof (error as { driverError?: { code?: unknown } }).driverError?.code === 'string' &&
  RETRYABLE_CODES.has((error as { driverError: { code: string } }).driverError.code);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Whether the server already starts every transaction at READ COMMITTED (Postgres' default), asked once per data
 * source. Then `START TRANSACTION` alone gives the isolation we want and the `SET TRANSACTION ISOLATION LEVEL` round
 * trip TypeORM sends after it can be skipped (it was one of every request's statements). Any doubt keeps the SET.
 */
const readCommittedByDefault = new WeakMap<DataSource, Promise<boolean>>();

function startsReadCommitted(dataSource: DataSource): Promise<boolean> {
  let known = readCommittedByDefault.get(dataSource);
  if (!known) {
    known = (async () => {
      try {
        const rows = (await dataSource.query(`SELECT current_setting('default_transaction_isolation') AS level`)) as Array<{ level?: string }>;
        return rows[0]?.level === 'read committed';
      } catch {
        readCommittedByDefault.delete(dataSource); // ask again next time (e.g. the database was still starting)
        return false;
      }
    })();
    readCommittedByDefault.set(dataSource, known);
  }
  return known;
}

/**
 * Run `work` in a READ COMMITTED transaction, retrying on deadlocks/serialization failures with jittered backoff.
 * `work` must be idempotent with respect to its own side effects outside the database (do those after commit).
 */
export async function withTransaction<T>(
  dataSource: DataSource,
  work: (manager: EntityManager) => Promise<T>,
  maxAttempts = 4,
): Promise<T> {
  const implicit = await startsReadCommitted(dataSource);
  for (let attempt = 1; ; attempt++) {
    try {
      return await (implicit ? dataSource.transaction(work) : dataSource.transaction('READ COMMITTED', work));
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryable(error)) throw error;
      await sleep(15 * 2 ** attempt + Math.random() * 25);
    }
  }
}
