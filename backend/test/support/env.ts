import { createHash } from 'node:crypto';

/**
 * Environment of the end-to-end suite. Everything is set explicitly (a developer's backend/.env never leaks in: the
 * process environment wins over the .env file in @nestjs/config) and points at throwaway resources:
 *
 * - Postgres: a dedicated database (`insidelife_e2e` on the dev Postgres by default; E2E_DATABASE_URL overrides it,
 *   e.g. in CI). It is dropped and created fresh by the global setup. Its name must end in `_e2e`.
 * - Redis: a dedicated DB index (11 by default; E2E_REDIS_URL overrides it). Only that index is flushed.
 * - Flutterwave: no secret key, so the built-in sandbox checkout is used (the Flutterwave-gateway spec swaps in the
 *   real client against a fake Flutterwave API). The webhook secret hash is a test value so signed webhooks can be sent.
 * - Object storage: stubbed in memory by the test app (see app.ts).
 */
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgres://insidelife:insidelife@localhost:55432/insidelife_e2e';
export const E2E_REDIS_URL = process.env.E2E_REDIS_URL ?? 'redis://localhost:56379/11';

/** Deterministic per run is fine: these never leave the test process. */
const secret = (label: string, length: number): string => createHash('sha256').update(`insidelife-e2e:${label}`).digest('hex').slice(0, length);

export const E2E = {
  gameOrigin: 'http://game.e2e.test',
  adminOrigin: 'http://admin.e2e.test',
  ownerEmail: 'owner@e2e.test',
  webhookHash: secret('flutterwave-webhook-hash', 64),
  password: 'Passw0rd-e2e',
} as const;

/** The environment every e2e app boots with. */
export const E2E_ENV: Readonly<Record<string, string>> = {
  NODE_ENV: 'test',
  DEPLOYMENT: 'local',
  PORT: '0',
  CORS_ORIGINS: E2E.gameOrigin,
  ADMIN_ORIGINS: E2E.adminOrigin,
  ADMIN_API_HOST: '',
  LOG_LEVEL: process.env.E2E_LOG_LEVEL ?? 'fatal',
  TRUST_PROXY_HOPS: '1',
  DATABASE_URL: E2E_DATABASE_URL,
  DATABASE_POOL_SIZE: '40',
  // The global setup runs every migration on a fresh database; the app must not try again (its glob is for dist/).
  DATABASE_RUN_MIGRATIONS: 'false',
  DATABASE_SYNCHRONIZE: 'false',
  REDIS_URL: E2E_REDIS_URL,
  JWT_ACCESS_SECRET: secret('jwt-access', 64),
  JWT_ACCESS_TTL_SECONDS: '900',
  REFRESH_TOKEN_TTL_DAYS: '30',
  COOKIE_SECURE: 'false',
  REQUIRE_EMAIL_VERIFICATION: 'false',
  GAME_EPOCH: '2026-10-01T00:00:00.000Z',
  GAME_TIME_SCALE: '120',
  // Pinned like everything else so a developer's .env can't slow (or speed up) the suite's clock mid-run.
  GAME_TIME_RESCALES: '',
  WORLD_SEED: 'e2e-world-seed',
  MARKET_SEED: secret('market-seed', 32),
  BETTING_SECRET: secret('betting-secret', 48),
  BETTING_MAX_STAKE: '1000000',
  BETTING_DAILY_LOSS_LIMIT: '5000000',
  FLUTTERWAVE_SECRET_KEY: '',
  FLUTTERWAVE_PUBLIC_KEY: '',
  FLUTTERWAVE_WEBHOOK_SECRET_HASH: E2E.webhookHash,
  PAYMENT_CALLBACK_URL: `${E2E.gameOrigin}/payments/callback`,
  TOPUP_DAILY_LIMIT_NGN: '0',
  TOPUP_MAX_PER_PAYMENT_NGN: '10000000',
  // Dollars off, as on a fresh live site; the dollar specs switch them on for their own app.
  PAYMENTS_USD_ENABLED: 'false',
  TOPUP_MAX_PER_PAYMENT_USD: '5000',
  PAYMENTS_WALLETS_ENABLED: 'false',
  ALLOW_PAYMENT_SANDBOX: 'false',
  S3_ENDPOINT: 'http://storage.e2e.invalid:8333',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY: 'e2e-access-key',
  S3_SECRET_KEY: secret('s3-secret', 32),
  S3_BUCKET: 'insidelife-e2e',
  S3_PRIVATE_BUCKET: 'insidelife-e2e-private',
  S3_PUBLIC_BASE_URL: '/media',
  PHONE_APP_AD_SLOTS: '10',
  ADMIN_EMAILS: E2E.ownerEmail,
  ADMIN_MFA_KEY: secret('admin-mfa-key', 48),
  ADMIN_ACCESS_TTL_SECONDS: '600',
  ADMIN_SESSION_MAX_HOURS: '12',
  ADMIN_SESSION_IDLE_MINUTES: '120',
  ACCOUNT_RESTORE_DAYS: '30',
  SMTP_URL: '',
  SMTP_HOST: '',
  SMTP_USER: '',
  SMTP_PASS: '',
  MAIL_FROM: 'Inside Life <hello@insidelife.online>',
};

export function applyE2eEnv(overrides: Readonly<Record<string, string>> = {}): void {
  for (const [key, value] of Object.entries({ ...E2E_ENV, ...overrides })) process.env[key] = value;
}

/** Refuse to touch anything that isn't clearly a throwaway e2e resource. */
export function assertThrowaway(databaseUrl: string, redisUrl: string): { readonly database: string; readonly redisDb: number } {
  const database = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (!database.endsWith('_e2e')) throw new RangeError(`Refusing to use database "${database}": e2e databases must end in _e2e`);
  const redisDb = Number(new URL(redisUrl).pathname.replace(/^\//, '') || '0');
  if (!Number.isInteger(redisDb) || redisDb === 0) throw new RangeError(`Refusing to flush Redis DB ${redisDb}: use a dedicated index (e.g. /11)`);
  return { database, redisDb };
}
