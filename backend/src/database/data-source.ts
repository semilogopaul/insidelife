import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolvePostgresConnection } from './connection-options.js';
import { SnakeNamingStrategy } from './snake-naming.strategy.js';

/**
 * DataSource for the TypeORM CLI and the run-and-exit migration entry point (`migrate.ts`). The running app builds
 * its own options in DatabaseModule from the same pieces.
 *
 * Migrations may use a separate direct connection: `DATABASE_MIGRATION_URL` (falls back to `DATABASE_URL`). Behind a
 * transaction-mode PgBouncer (Azure Flexible Server, port 6432) point it at the server itself (port 5432).
 */
const here = dirname(fileURLToPath(import.meta.url));

export const entityGlobs = [join(here, '..', '**', '*.entity.js')];
export const migrationGlobs = [join(here, 'migrations', '*.js')];

const connection = resolvePostgresConnection(
  process.env.DATABASE_MIGRATION_URL?.trim() || process.env.DATABASE_URL || '',
  process.env.DATABASE_SSL,
);

export default new DataSource({
  type: 'postgres',
  url: connection.url,
  ssl: connection.ssl,
  uuidExtension: 'pgcrypto',
  entities: entityGlobs,
  migrations: migrationGlobs,
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
});
