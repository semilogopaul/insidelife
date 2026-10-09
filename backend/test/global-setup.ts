import 'reflect-metadata';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Redis } from 'ioredis';
import pg from 'pg';
import { DataSource, type MigrationInterface } from 'typeorm';
import { SnakeNamingStrategy } from '../src/database/snake-naming.strategy.js';
import { E2E_DATABASE_URL, E2E_REDIS_URL, assertThrowaway } from './support/env.js';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', 'src', 'database', 'migrations');

type MigrationClass = new () => MigrationInterface;

/** Every migration class in src/database/migrations, oldest first (the same set production runs from dist/). */
export async function loadMigrations(): Promise<MigrationClass[]> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
    .toSorted();
  const classes: MigrationClass[] = [];
  for (const file of files) {
    const module = (await import(pathToFileURL(join(MIGRATIONS_DIR, file)).href)) as Record<string, unknown>;
    for (const value of Object.values(module)) if (typeof value === 'function') classes.push(value as MigrationClass);
  }
  return classes;
}

export function migrationDataSource(migrations: MigrationClass[]): DataSource {
  return new DataSource({
    type: 'postgres',
    url: E2E_DATABASE_URL,
    uuidExtension: 'pgcrypto',
    migrations,
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: false,
    logging: ['error'],
  });
}

/**
 * Once per run: a brand-new e2e database with every migration applied (so the migrations themselves are under test),
 * and an empty Redis DB index. Nothing else is touched.
 */
export default async function setup(): Promise<() => Promise<void>> {
  const { database } = assertThrowaway(E2E_DATABASE_URL, E2E_REDIS_URL);

  const maintenance = new URL(E2E_DATABASE_URL);
  maintenance.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: maintenance.toString() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${database}"`);
  } finally {
    await admin.end();
  }

  const migrations = await loadMigrations();
  const dataSource = migrationDataSource(migrations);
  await dataSource.initialize();
  try {
    const applied = await dataSource.runMigrations({ transaction: 'each' });
    if (applied.length !== migrations.length) throw new RangeError(`Applied ${applied.length} of ${migrations.length} migrations`);
  } finally {
    await dataSource.destroy();
  }

  const redis = new Redis(E2E_REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2 });
  await redis.connect();
  await redis.flushdb();
  await redis.quit();

  return async () => {
    // The database is left in place for inspection after a run (it is recreated by the next one). E2E_DROP_DB=1 drops it.
    if (process.env.E2E_DROP_DB !== '1') return;
    const client = new pg.Client({ connectionString: maintenance.toString() });
    await client.connect();
    await client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await client.end();
  };
}
