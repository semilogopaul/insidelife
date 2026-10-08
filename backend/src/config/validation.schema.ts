import Joi from 'joi';

/**
 * Environment contract. Validated at startup so a misconfigured server never boots.
 * Every variable is documented in backend/README.md and backend/.env.example.
 */
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(4000),
  CORS_ORIGINS: Joi.string().required(),
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace').default('info'),

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

  GAME_EPOCH: Joi.date().iso().required(),
  GAME_TIME_SCALE: Joi.number().min(1).max(10_000).default(120),
  WORLD_SEED: Joi.string().min(4).max(64).required(),
  /** Secret seed for market prices (the world seed is public). Set it in production; derived from JWT secret otherwise. */
  MARKET_SEED: Joi.string().min(16).max(128).optional(),

  PAYSTACK_SECRET_KEY: Joi.string().allow('').pattern(/^(sk_(test|live)_[A-Za-z0-9]+)?$/).default(''),
  PAYSTACK_CALLBACK_URL: Joi.string().uri().required(),
  TOPUP_DAILY_LIMIT_NGN: Joi.number().integer().min(0).default(20_000),
  /** Object storage (SeaweedFS locally, any S3-compatible store in production) for ad creatives and club tracks. */
  S3_ENDPOINT: Joi.string().uri().required(),
  S3_REGION: Joi.string().default('us-east-1'),
  S3_ACCESS_KEY: Joi.string().min(3).required(),
  S3_SECRET_KEY: Joi.string().min(8).required(),
  S3_BUCKET: Joi.string().min(3).max(63).required(),
  /** Public base URL the browser uses to load media (e.g. http://localhost:8080/media). */
  S3_PUBLIC_BASE_URL: Joi.string().uri({ allowRelative: true }).required(),
  /** Comma-separated emails that get the admin role (moderation of ads and music). */
  ADMIN_EMAILS: Joi.string().allow('').default(''),

  /** Allow the fake checkout when no Paystack key is set. Never enable on a public deployment. */
  ALLOW_PAYMENT_SANDBOX: Joi.boolean().default(false),
}).custom((value: { NODE_ENV: string; PAYSTACK_SECRET_KEY: string; JWT_ACCESS_SECRET: string; CORS_ORIGINS: string; ALLOW_PAYMENT_SANDBOX: boolean }, helpers) => {
  if (value.NODE_ENV === 'production') {
    if (!value.PAYSTACK_SECRET_KEY && !value.ALLOW_PAYMENT_SANDBOX) {
      return helpers.message({ custom: 'PAYSTACK_SECRET_KEY is required in production' });
    }
    if (value.JWT_ACCESS_SECRET.startsWith('change-me') && !value.ALLOW_PAYMENT_SANDBOX) {
      return helpers.message({ custom: 'JWT_ACCESS_SECRET must be changed in production' });
    }
    if ((value as { DATABASE_SYNCHRONIZE?: boolean }).DATABASE_SYNCHRONIZE) {
      return helpers.message({ custom: 'DATABASE_SYNCHRONIZE is not allowed in production' });
    }
    if (value.CORS_ORIGINS.split(',').some((origin) => origin.trim() === '*')) {
      return helpers.message({ custom: 'CORS_ORIGINS cannot contain a wildcard in production' });
    }
  }
  return value;
});
