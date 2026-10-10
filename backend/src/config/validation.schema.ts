import Joi from 'joi';
import { parseClockRescales } from '@insidelife/shared';

/**
 * Environment contract. Validated at startup so a misconfigured server never boots.
 * Every variable is documented in backend/README.md and backend/.env.example.
 */
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(4000),
  CORS_ORIGINS: Joi.string().required(),
  /**
   * Origins of the separate admin portal (comma-separated, e.g. `https://admin.insidelife.online`). Empty = no admin
   * portal can call the API from a browser. https only on the live site.
   */
  ADMIN_ORIGINS: Joi.string()
    .allow('')
    .default('')
    .custom((value: string, helpers) => {
      const bad = value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
        .find((origin) => !isOrigin(origin));
      return bad ? helpers.message({ custom: `ADMIN_ORIGINS: "${bad}" is not an origin like https://admin.insidelife.online` }) : value;
    }),
  /**
   * Optional hardening: serve the admin API only on this host (e.g. `admin-api.insidelife.online`, proxied to the same
   * backend). Empty = the admin API answers on every host the API does.
   */
  ADMIN_API_HOST: Joi.string().hostname().allow('').default(''),
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace').default('info'),
  /** Reverse proxies in front of the API: 1 behind nginx, 2 with an edge (Caddy) in front of nginx. */
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).max(5).default(1),
  /**
   * `public` = the live site (players, real money). Turns on the strict checks below: secure cookies, https origins,
   * real secrets and seeds, no payment sandbox. `local` (default) is the docker stack on your machine.
   */
  DEPLOYMENT: Joi.string().valid('local', 'public').default('local'),

  DATABASE_URL: Joi.string().uri({ scheme: ['postgres', 'postgresql'] }).required(),
  DATABASE_POOL_SIZE: Joi.number().integer().min(2).max(200).default(20),
  DATABASE_RUN_MIGRATIONS: Joi.boolean().default(true),
  /** Prototype-only: let TypeORM sync the schema to entities. Refused in production; migrations are the source of truth. */
  DATABASE_SYNCHRONIZE: Joi.boolean().default(false),

  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL_SECONDS: Joi.number().integer().min(60).max(86_400).default(900),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().min(1).max(365).default(30),
  COOKIE_SECURE: Joi.boolean().default(false),
  /** Require a confirmed email (6-digit code) before playing. Off by default: players may verify from Me → Settings. */
  REQUIRE_EMAIL_VERIFICATION: Joi.boolean().default(false),

  GAME_EPOCH: Joi.date().iso().required(),
  GAME_TIME_SCALE: Joi.number().min(1).max(10_000).default(60),
  // `<ISO time>@<scale>,…`: later speed changes, each continuous with the clock before it (docs/DEPLOY.md).
  GAME_TIME_RESCALES: Joi.string()
    .allow('')
    .default('')
    .custom((value: string) => {
      parseClockRescales(value);
      return value;
    }, 'clock rescales'),
  WORLD_SEED: Joi.string().min(4).max(64).required(),
  /** Secret seed for market prices (the world seed is public). Set it in production; derived from JWT secret otherwise. */
  MARKET_SEED: Joi.string().min(16).max(128).optional(),
  /**
   * Server-only secret the betting league draws every result from (the world seed is public, so results can never
   * depend on it). Required (32+ random characters) on the live site; locally it is derived from JWT_ACCESS_SECRET
   * with HKDF. Changing it re-draws every match not yet played, so set it once.
   */
  BETTING_SECRET: Joi.string().min(32).max(256).optional(),
  /** Largest stake on one betting slip (game naira). */
  BETTING_MAX_STAKE: Joi.number().integer().min(100).max(1_000_000_000).default(1_000_000),
  /** Default and highest daily loss limit per player (game naira, net losses per game day); players can set it lower. */
  BETTING_DAILY_LOSS_LIMIT: Joi.number().integer().min(100).max(100_000_000_000).default(5_000_000),

  /** Flutterwave v3 secret key: `FLWSECK_TEST-…` locally, `FLWSECK-…` (live) on the public site. Empty → sandbox in development. */
  FLUTTERWAVE_SECRET_KEY: Joi.string().allow('').pattern(/^(FLWSECK(_TEST)?-[A-Za-z0-9-]+)?$/).default(''),
  /** Not used by the server (hosted checkout needs no public key); validated so a live site never ships a test key. */
  FLUTTERWAVE_PUBLIC_KEY: Joi.string().allow('').pattern(/^(FLWPUBK(_TEST)?-[A-Za-z0-9-]+)?$/).default(''),
  /** The secret hash set in Flutterwave → Settings → Webhooks; sent verbatim in the `verif-hash` header. */
  FLUTTERWAVE_WEBHOOK_SECRET_HASH: Joi.string().allow('').max(256).default(''),
  /**
   * Where Flutterwave returns the player after checkout (the web app's /payments/callback). Required in production;
   * in development it defaults to http://localhost:3100/payments/callback.
   */
  PAYMENT_CALLBACK_URL: Joi.string().uri().allow('').default(''),
  /** Real naira one account may spend on top-ups per UTC day; 0 (the default) = no cap. A lever against chargebacks. */
  TOPUP_DAILY_LIMIT_NGN: Joi.number().integer().min(0).max(1_000_000_000).default(0),
  /** Largest single top-up in real naira (pack or custom amount). */
  TOPUP_MAX_PER_PAYMENT_NGN: Joi.number().integer().min(500).max(100_000_000).default(10_000_000),
  /** Object storage (SeaweedFS locally, any S3-compatible store in production) for ad creatives and club tracks. */
  S3_ENDPOINT: Joi.string().uri().required(),
  S3_REGION: Joi.string().default('us-east-1'),
  S3_ACCESS_KEY: Joi.string().min(3).required(),
  S3_SECRET_KEY: Joi.string().min(8).required(),
  S3_BUCKET: Joi.string().min(3).max(63).required(),
  /** Bucket for private media (chat voice notes and photos); never readable anonymously. */
  S3_PRIVATE_BUCKET: Joi.string().min(3).max(63).default('insidelife-private'),
  /** Public base URL the browser uses to load media (e.g. http://localhost:8080/media). */
  S3_PUBLIC_BASE_URL: Joi.string().uri({ allowRelative: true }).required(),
  /** Sponsored apps sold on the phone's home screen (0-20). */
  PHONE_APP_AD_SLOTS: Joi.number().integer().min(0).max(20).default(10),
  /** Comma-separated emails that get the admin role (moderation of ads and music). */
  ADMIN_EMAILS: Joi.string().allow('').default(''),
  /** Encrypts admins' authenticator (TOTP) secrets at rest. Required on the live site; never change it afterwards. */
  ADMIN_MFA_KEY: Joi.string().min(32).max(256).optional(),
  ADMIN_ACCESS_TTL_SECONDS: Joi.number().integer().min(60).max(3600).default(600),
  ADMIN_SESSION_MAX_HOURS: Joi.number().integer().min(1).max(72).default(12),
  ADMIN_SESSION_IDLE_MINUTES: Joi.number().integer().min(5).max(1440).default(120),
  /** Days a deleted account can still be restored before it is anonymised. */
  ACCOUNT_RESTORE_DAYS: Joi.number().integer().min(1).max(365).default(30),

  /** Allow the fake checkout when no Flutterwave key is set. Never enable on a public deployment. */
  ALLOW_PAYMENT_SANDBOX: Joi.boolean().default(false),

  /**
   * Outgoing email (verification codes). Either one URL (`smtp://user:pass@host:587`, `smtps://…:465`) or the host
   * fields. Required in production when REQUIRE_EMAIL_VERIFICATION is on; in development without it the code is
   * logged instead of sent.
   */
  SMTP_URL: Joi.string().uri({ scheme: ['smtp', 'smtps'] }).allow('').default(''),
  SMTP_HOST: Joi.string().hostname().allow('').default(''),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: Joi.boolean().optional(),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASS: Joi.string().allow('').default(''),
  MAIL_FROM: Joi.string().max(254).allow('').default('Inside Life <hello@insidelife.online>'),
}).custom((value: EnvForChecks, helpers) => {
  const problem = productionProblem(value);
  return problem ? helpers.message({ custom: problem }) : value;
});

interface EnvForChecks {
  readonly NODE_ENV: string;
  readonly DEPLOYMENT: 'local' | 'public';
  readonly FLUTTERWAVE_SECRET_KEY: string;
  readonly FLUTTERWAVE_PUBLIC_KEY?: string;
  readonly FLUTTERWAVE_WEBHOOK_SECRET_HASH?: string;
  readonly PAYMENT_CALLBACK_URL: string;
  readonly JWT_ACCESS_SECRET: string;
  readonly CORS_ORIGINS: string;
  readonly ADMIN_ORIGINS?: string;
  readonly ADMIN_MFA_KEY?: string;
  readonly ALLOW_PAYMENT_SANDBOX: boolean;
  readonly COOKIE_SECURE: boolean;
  readonly MARKET_SEED?: string;
  readonly BETTING_SECRET?: string;
  readonly DATABASE_SYNCHRONIZE?: boolean;
  readonly S3_SECRET_KEY: string;
  readonly SMTP_URL?: string;
  readonly SMTP_HOST?: string;
  readonly REQUIRE_EMAIL_VERIFICATION?: boolean;
}

/** Secrets that ship in examples and the local docker stack: never acceptable on the live site. */
const PLACEHOLDER = /change-?me|local-docker|insidelife-storage-secret|^(.)\1+$|example|secret123/i;

/** Local mail catchers (Mailpit in the docker stack): fine on your machine, useless for real players. */
const MAIL_CATCHER = /mailpit|mailhog|localhost|127\.0\.0\.1/i;

/** `scheme://host[:port]` with nothing after it: what browsers send in the Origin header. */
function isOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.origin === value.replace(/\/+$/, '');
  } catch {
    return false;
  }
}

/** Flutterwave test-mode keys carry `_TEST` (`FLWSECK_TEST-…`, `FLWPUBK_TEST-…`). */
const TEST_KEY = /^FLW(SECK|PUBK)_TEST-/;

/** Why this environment must not boot (null = fine). Exported for tests. */
export function productionProblem(value: EnvForChecks): string | null {
  const smtp = value.SMTP_URL || value.SMTP_HOST || '';
  const webhookHash = value.FLUTTERWAVE_WEBHOOK_SECRET_HASH ?? '';
  if (value.NODE_ENV === 'production') {
    if (!value.FLUTTERWAVE_SECRET_KEY && !value.ALLOW_PAYMENT_SANDBOX) return 'FLUTTERWAVE_SECRET_KEY is required in production';
    if (!value.PAYMENT_CALLBACK_URL) return 'PAYMENT_CALLBACK_URL is required in production';
    // With verification required and no mail, nobody could confirm their email, so nobody could play.
    if (value.REQUIRE_EMAIL_VERIFICATION && !smtp) return 'SMTP_URL (or SMTP_HOST) is required in production when REQUIRE_EMAIL_VERIFICATION is on';
    // A placeholder signing key lets anyone mint tokens: refused in production whatever else is set.
    if (value.JWT_ACCESS_SECRET.startsWith('change-me')) return 'JWT_ACCESS_SECRET must be changed in production';
    if (value.DATABASE_SYNCHRONIZE) return 'DATABASE_SYNCHRONIZE is not allowed in production';
    if (value.CORS_ORIGINS.split(',').some((origin) => origin.trim() === '*')) return 'CORS_ORIGINS cannot contain a wildcard in production';
  }
  if (value.DEPLOYMENT === 'public') {
    if (value.NODE_ENV !== 'production') return 'DEPLOYMENT=public needs NODE_ENV=production';
    if (value.ALLOW_PAYMENT_SANDBOX) return 'ALLOW_PAYMENT_SANDBOX must be off on the live site';
    if (!value.FLUTTERWAVE_SECRET_KEY) return 'FLUTTERWAVE_SECRET_KEY is required on the live site';
    if (TEST_KEY.test(value.FLUTTERWAVE_SECRET_KEY)) return 'FLUTTERWAVE_SECRET_KEY must be the live key (FLWSECK-…), not a test key, on the live site';
    if (value.FLUTTERWAVE_PUBLIC_KEY && TEST_KEY.test(value.FLUTTERWAVE_PUBLIC_KEY)) return 'FLUTTERWAVE_PUBLIC_KEY must be the live key (FLWPUBK-…), not a test key, on the live site';
    // Without the hash every webhook is refused, so missed redirects would wait for the reconciler.
    if (webhookHash.length < 32 || PLACEHOLDER.test(webhookHash)) {
      return 'FLUTTERWAVE_WEBHOOK_SECRET_HASH must be a long random value (32+ characters, the same as in the Flutterwave dashboard) on the live site';
    }
    if (!value.COOKIE_SECURE) return 'COOKIE_SECURE must be true on the live site (HTTPS)';
    if (value.JWT_ACCESS_SECRET.length < 48 || PLACEHOLDER.test(value.JWT_ACCESS_SECRET)) return 'JWT_ACCESS_SECRET must be a long random secret (48+ characters) on the live site';
    if (!value.MARKET_SEED || PLACEHOLDER.test(value.MARKET_SEED)) return 'MARKET_SEED must be set to a private random value on the live site';
    if (!value.BETTING_SECRET || value.BETTING_SECRET.length < 32 || PLACEHOLDER.test(value.BETTING_SECRET)) {
      return 'BETTING_SECRET must be a long random secret (32+ characters) on the live site: it seeds every betting result';
    }
    if (PLACEHOLDER.test(value.S3_SECRET_KEY)) return 'S3_SECRET_KEY must be changed on the live site';
    if (value.CORS_ORIGINS.split(',').some((origin) => !origin.trim().startsWith('https://'))) return 'CORS_ORIGINS must be https:// origins on the live site';
    const adminOrigins = (value.ADMIN_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
    if (adminOrigins.some((origin) => !origin.startsWith('https://'))) return 'ADMIN_ORIGINS must be https:// origins on the live site';
    if (!value.ADMIN_MFA_KEY || value.ADMIN_MFA_KEY.length < 32 || PLACEHOLDER.test(value.ADMIN_MFA_KEY)) return 'ADMIN_MFA_KEY must be a long random secret (32+ characters) on the live site';
    if (!value.PAYMENT_CALLBACK_URL.startsWith('https://')) return 'PAYMENT_CALLBACK_URL must be https:// on the live site';
    if (smtp && MAIL_CATCHER.test(smtp)) return 'SMTP_URL must be a real mail server on the live site (not a local mail catcher)';
  }
  return null;
}
