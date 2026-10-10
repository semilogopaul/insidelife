import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { STARTER_FUND } from '@insidelife/shared';
import { validationSchema } from '../src/config/validation.schema.js';
import { loadMigrations } from './global-setup.js';
import { bootApp, type E2eApp } from './support/app.js';
import { E2E_DATABASE_URL, applyE2eEnv } from './support/env.js';
import { createPlayer, ok } from './support/players.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');

let e2e: E2eApp;

beforeAll(async () => {
  e2e = await bootApp();
});

afterAll(async () => {
  await e2e?.close();
});

describe('boot', () => {
  it('boots the real app and answers', async () => {
    const player = await createPlayer(e2e);
    const snapshot = await player.snapshot();
    expect(snapshot.wallet.balance).toBeGreaterThanOrEqual(STARTER_FUND);
    expect(ok<{ status: string }>(await player.get('/api/health')).status).toBe('ok');
  });
});

describe('database migrations', () => {
  it('ran every migration on a fresh database, in order', async () => {
    const classes = await loadMigrations();
    const applied = await e2e.dataSource.query<Array<{ name: string }>>(`SELECT name FROM migrations ORDER BY id`);
    expect(applied.map((row) => row.name)).toEqual(classes.map((migration) => new migration().name ?? migration.name));
  });

  it('leave the schema exactly as the entities describe it (no drift)', async () => {
    const pending = await e2e.dataSource.driver.createSchemaBuilder().log();
    expect(pending.upQueries.map((query) => query.query)).toEqual([]);
  });

  it('can all be reverted and applied again (on a separate throwaway database)', async () => {
    const url = new URL(E2E_DATABASE_URL);
    const database = `${url.pathname.slice(1).replace(/_e2e$/, '')}_migrations_e2e`;
    const maintenance = new URL(E2E_DATABASE_URL);
    maintenance.pathname = '/postgres';
    const admin = new DataSource({ type: 'postgres', url: maintenance.toString() });
    await admin.initialize();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${database}"`);
    url.pathname = `/${database}`;
    const { SnakeNamingStrategy } = await import('../src/database/snake-naming.strategy.js');
    const migrations = await loadMigrations();
    const target = new DataSource({ type: 'postgres', url: url.toString(), uuidExtension: 'pgcrypto', migrations, namingStrategy: new SnakeNamingStrategy() });
    await target.initialize();
    try {
      expect(await target.runMigrations({ transaction: 'each' })).toHaveLength(migrations.length);
      for (let i = 0; i < migrations.length; i++) await target.undoLastMigration({ transaction: 'each' });
      expect(await target.query(`SELECT COUNT(*)::int AS n FROM migrations`)).toEqual([{ n: 0 }]);
      expect(await target.runMigrations({ transaction: 'each' })).toHaveLength(migrations.length);
    } finally {
      await target.destroy();
      await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      await admin.destroy();
    }
  });
});

/** A complete, valid live-site environment, built like the runbook says (random secrets, live keys, https). */
const secret = (bytes = 48): string => randomBytes(bytes).toString('base64url');
const hex = (bytes: number): string => randomBytes(bytes).toString('hex');

function liveEnv(): Record<string, string> {
  return {
    NODE_ENV: 'production',
    DEPLOYMENT: 'public',
    CORS_ORIGINS: 'https://insidelife.online,https://www.insidelife.online',
    ADMIN_ORIGINS: 'https://admin.insidelife.online',
    DATABASE_URL: `postgres://insidelife:${secret(24)}@postgres:5432/insidelife`,
    REDIS_URL: `redis://:${secret(24)}@redis:6379`,
    JWT_ACCESS_SECRET: secret(),
    COOKIE_SECURE: 'true',
    GAME_EPOCH: '2026-11-01T00:00:00.000Z',
    WORLD_SEED: 'eko-o-ni-baje',
    MARKET_SEED: secret(32),
    FLUTTERWAVE_SECRET_KEY: `FLWSECK-${hex(16)}-X`,
    FLUTTERWAVE_PUBLIC_KEY: `FLWPUBK-${hex(16)}-X`,
    FLUTTERWAVE_WEBHOOK_SECRET_HASH: randomBytes(32).toString('hex'),
    PAYMENT_CALLBACK_URL: 'https://insidelife.online/payments/callback',
    ALLOW_PAYMENT_SANDBOX: 'false',
    S3_ENDPOINT: 'http://storage:8333',
    S3_ACCESS_KEY: secret(16),
    S3_SECRET_KEY: secret(32),
    S3_BUCKET: 'insidelife-media',
    S3_PUBLIC_BASE_URL: '/media',
    ADMIN_EMAILS: 'owner@insidelife.online',
    ADMIN_MFA_KEY: secret(),
  };
}

const problemWith = (overrides: Record<string, string | undefined>): string | null => {
  const env: Record<string, string> = Object.fromEntries(Object.entries({ ...liveEnv(), ...overrides }).filter((entry): entry is [string, string] => entry[1] !== undefined));
  const { error } = validationSchema.validate(env, { allowUnknown: true });
  return error?.message ?? null;
};

describe('production configuration (DEPLOYMENT=public)', () => {
  it('accepts a properly configured live site', () => {
    expect(problemWith({})).toBeNull();
  });

  const unsafe: ReadonlyArray<readonly [string, Record<string, string | undefined>, RegExp]> = [
    ['no Flutterwave key (sandbox)', { FLUTTERWAVE_SECRET_KEY: '' }, /FLUTTERWAVE_SECRET_KEY is required/],
    ['a Flutterwave test secret key', { FLUTTERWAVE_SECRET_KEY: 'FLWSECK_TEST-abc123-X' }, /live key/],
    ['a Flutterwave test public key', { FLUTTERWAVE_PUBLIC_KEY: 'FLWPUBK_TEST-abc123-X' }, /live key/],
    ['the example’s unfilled key', { FLUTTERWAVE_PUBLIC_KEY: 'FLWPUBK-' }, /FLUTTERWAVE_PUBLIC_KEY/],
    ['the payment sandbox switched on', { ALLOW_PAYMENT_SANDBOX: 'true' }, /ALLOW_PAYMENT_SANDBOX/],
    ['no webhook secret hash', { FLUTTERWAVE_WEBHOOK_SECRET_HASH: '' }, /FLUTTERWAVE_WEBHOOK_SECRET_HASH/],
    ['a short webhook secret hash', { FLUTTERWAVE_WEBHOOK_SECRET_HASH: 'abc123' }, /FLUTTERWAVE_WEBHOOK_SECRET_HASH/],
    ['a placeholder webhook hash', { FLUTTERWAVE_WEBHOOK_SECRET_HASH: 'change-me-change-me-change-me-change-me' }, /FLUTTERWAVE_WEBHOOK_SECRET_HASH/],
    ['insecure cookies', { COOKIE_SECURE: 'false' }, /COOKIE_SECURE/],
    ['a placeholder JWT secret', { JWT_ACCESS_SECRET: 'change-me-access-secret-at-least-32-characters-long' }, /JWT_ACCESS_SECRET/],
    ['a short JWT secret', { JWT_ACCESS_SECRET: randomBytes(20).toString('hex') }, /JWT_ACCESS_SECRET/],
    ['no market seed', { MARKET_SEED: undefined }, /MARKET_SEED/],
    ['the docker storage secret', { S3_SECRET_KEY: 'insidelife-storage-secret' }, /S3_SECRET_KEY/],
    ['an http game origin', { CORS_ORIGINS: 'http://insidelife.online' }, /CORS_ORIGINS/],
    ['a wildcard origin', { CORS_ORIGINS: '*' }, /CORS_ORIGINS/],
    ['an http admin origin', { ADMIN_ORIGINS: 'http://admin.insidelife.online' }, /ADMIN_ORIGINS/],
    ['no admin MFA key', { ADMIN_MFA_KEY: undefined }, /ADMIN_MFA_KEY/],
    ['an http payment callback', { PAYMENT_CALLBACK_URL: 'http://insidelife.online/payments/callback' }, /PAYMENT_CALLBACK_URL/],
    ['required email verification without mail', { REQUIRE_EMAIL_VERIFICATION: 'true', SMTP_URL: '' }, /SMTP_URL/],
    ['a local mail catcher', { SMTP_URL: 'smtp://mailpit:1025' }, /SMTP_URL/],
    ['public without production mode', { NODE_ENV: 'development' }, /NODE_ENV=production/],
  ];
  it.each(unsafe)('refuses %s', (_name, overrides, message) => {
    expect(problemWith(overrides)).toMatch(message);
  });

  it('the real app refuses to start on the live site with a Flutterwave test key', async () => {
    vi.resetModules();
    const saved = { ...process.env };
    try {
      for (const [name, value] of Object.entries({ ...liveEnv(), FLUTTERWAVE_SECRET_KEY: 'FLWSECK_TEST-abc123-X' })) process.env[name] = value;
      const { Test } = await import('@nestjs/testing');
      const { AppModule } = await import('../src/app.module.js');
      await expect(Test.createTestingModule({ imports: [AppModule] }).compile()).rejects.toThrow(/live key/);
    } finally {
      for (const name of Object.keys(process.env)) if (!(name in saved)) delete process.env[name];
      Object.assign(process.env, saved);
      applyE2eEnv();
      vi.resetModules();
    }
  });

  it('docker-compose.prod.yml + a filled-in .env.production.example gives the backend a config it accepts', () => {
    try {
      execFileSync('docker', ['compose', 'version'], { stdio: 'ignore' });
    } catch {
      // No docker on this machine: nothing to check (CI runners have it).
      return;
    }
    const filled = readFileSync(join(ROOT, '.env.production.example'), 'utf8')
      .split('\n')
      .map((line) => {
        const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
        if (!match) return line;
        const [, name, value] = match;
        // Fill the blanks the way the runbook says (random secrets, live Flutterwave keys, real addresses).
        if (name === 'FLUTTERWAVE_SECRET_KEY') return `${name}=FLWSECK-${randomBytes(12).toString('hex')}-X`;
        if (name === 'FLUTTERWAVE_PUBLIC_KEY') return `${name}=FLWPUBK-${randomBytes(12).toString('hex')}-X`;
        if (name === 'FLUTTERWAVE_WEBHOOK_SECRET_HASH') return `${name}=${randomBytes(32).toString('hex')}`;
        if (name === 'ADMIN_EMAILS') return `${name}=owner@insidelife.online`;
        if (name === 'ACME_EMAIL') return `${name}=ops@insidelife.online`;
        // Optional settings that are blank by design (not secrets) stay blank.
        if (value === '' && !['SMTP_URL', 'ADMIN_API_HOST', 'GAME_TIME_RESCALES'].includes(name!)) return `${name}=${randomBytes(36).toString('base64url')}`;
        return line;
      })
      .join('\n');
    const dir = mkdtempSync(join(tmpdir(), 'insidelife-compose-'));
    const envFile = join(dir, '.env.production');
    writeFileSync(envFile, filled);
    // Only the env file: compose prefers the shell's variables, and this process carries the e2e ones.
    const shell = Object.fromEntries(['PATH', 'HOME', 'DOCKER_HOST', 'DOCKER_CONFIG', 'DOCKER_CONTEXT'].flatMap((name) => (process.env[name] ? [[name, process.env[name]!]] : [])));
    const json = execFileSync('docker', ['compose', '-f', join(ROOT, 'docker-compose.prod.yml'), '--env-file', envFile, 'config', '--format', 'json'], { encoding: 'utf8', env: shell });
    const config = JSON.parse(json) as { services: Record<string, { environment?: Record<string, string | null> }> };
    const backend = config.services.backend?.environment ?? {};
    expect(backend.DEPLOYMENT).toBe('public');
    const env = Object.fromEntries(Object.entries(backend).map(([name, value]) => [name, value ?? '']));
    const { error } = validationSchema.validate(env, { allowUnknown: true });
    expect(error?.message ?? null).toBeNull();
  });
});
