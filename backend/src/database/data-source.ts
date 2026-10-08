import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SnakeNamingStrategy } from './snake-naming.strategy.js';

/**
 * DataSource for the TypeORM CLI (migrations). The running app builds its own options in DatabaseModule from the
 * same pieces; both read DATABASE_URL.
 */
const here = dirname(fileURLToPath(import.meta.url));

export const entityGlobs = [join(here, '..', '**', '*.entity.js')];
export const migrationGlobs = [join(here, 'migrations', '*.js')];

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  uuidExtension: 'pgcrypto',
  entities: entityGlobs,
  migrations: migrationGlobs,
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
});
