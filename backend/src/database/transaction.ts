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
 * Run `work` in a READ COMMITTED transaction, retrying on deadlocks/serialization failures with jittered backoff.
 * `work` must be idempotent with respect to its own side effects outside the database (do those after commit).
 */
export async function withTransaction<T>(
  dataSource: DataSource,
  work: (manager: EntityManager) => Promise<T>,
  maxAttempts = 4,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await dataSource.transaction('READ COMMITTED', work);
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryable(error)) throw error;
      await sleep(15 * 2 ** attempt + Math.random() * 25);
    }
  }
}
