import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { DataSource } from 'typeorm';
import dataSource from './data-source.js';

/**
 * Run-and-exit migration entry point for a one-off job (Azure Container Apps job, `docker run`, CI):
 *
 *   node backend/dist/database/migrate.js
 *
 * Applies every pending migration (one transaction) and exits 0, or logs the error and exits 1. It reads
 * `DATABASE_MIGRATION_URL` (falling back to `DATABASE_URL`) and `DATABASE_SSL`; API replicas then run with
 * `DATABASE_RUN_MIGRATIONS=false`.
 */
export async function migrate(
  source: Pick<DataSource, 'initialize' | 'runMigrations' | 'destroy' | 'isInitialized'>,
  log: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): Promise<number> {
  try {
    await source.initialize();
    const applied = await source.runMigrations({ transaction: 'all' });
    log(
      applied.length === 0
        ? 'Database is up to date; no migrations to run.'
        : `Applied ${applied.length} migration(s): ${applied.map((migration) => migration.name).join(', ')}`,
    );
    return 0;
  } catch (error) {
    log(`Migration failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    return 1;
  } finally {
    if (source.isInitialized) await source.destroy().catch(() => undefined);
  }
}

/** True when this file is the process entry point (not when a test imports it). */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  process.exitCode = await migrate(dataSource, (line) => process.stderr.write(`${line}\n`));
}
