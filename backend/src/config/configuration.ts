/**
 * Typed configuration. Read through `ConfigService<AppConfig, true>` so every key is checked at compile time.
 */
export interface AppConfig {
  readonly env: 'development' | 'test' | 'production';
  readonly port: number;
  readonly corsOrigins: readonly string[];
  readonly logLevel: string;
  readonly database: {
    readonly url: string;
    readonly poolSize: number;
    readonly runMigrations: boolean;
    readonly synchronize: boolean;
  };
  readonly redis: { readonly url: string };
  readonly auth: {
    readonly accessSecret: string;
    readonly accessTtlSeconds: number;
    readonly refreshTtlDays: number;
    readonly cookieSecure: boolean;
  };
  readonly game: {
    readonly epochRealMs: number;
    readonly timeScale: number;
    readonly worldSeed: string;
  };
  readonly storage: {
    readonly endpoint: string;
    readonly region: string;
    readonly accessKey: string;
    readonly secretKey: string;
    readonly bucket: string;
    readonly privateBucket: string;
    readonly publicBaseUrl: string;
  };
  readonly adminEmails: readonly string[];
  readonly paystack: {
    readonly secretKey: string;
    readonly callbackUrl: string;
    readonly dailyLimitNgn: number;
    /** Sandbox checkout is used when there is no secret key and this is allowed (always in development). */
    readonly sandbox: boolean;
  };
}

const bool = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined ? fallback : ['true', '1', 'yes'].includes(value.toLowerCase());

export const configuration = (): AppConfig => {
  const env = process.env;
  return {
    env: (env.NODE_ENV as AppConfig['env']) ?? 'development',
    port: Number(env.PORT ?? 4000),
    corsOrigins: (env.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    logLevel: env.LOG_LEVEL ?? 'info',
    database: {
      url: env.DATABASE_URL ?? '',
      poolSize: Number(env.DATABASE_POOL_SIZE ?? 20),
      runMigrations: bool(env.DATABASE_RUN_MIGRATIONS, true),
      synchronize: env.NODE_ENV !== 'production' && bool(env.DATABASE_SYNCHRONIZE, false),
    },
    redis: { url: env.REDIS_URL ?? '' },
    auth: {
      accessSecret: env.JWT_ACCESS_SECRET ?? '',
      accessTtlSeconds: Number(env.JWT_ACCESS_TTL_SECONDS ?? 900),
      refreshTtlDays: Number(env.REFRESH_TOKEN_TTL_DAYS ?? 30),
      cookieSecure: bool(env.COOKIE_SECURE, false),
    },
    game: {
      epochRealMs: Date.parse(env.GAME_EPOCH ?? '2026-10-01T00:00:00.000Z'),
      timeScale: Number(env.GAME_TIME_SCALE ?? 120),
      worldSeed: env.WORLD_SEED ?? 'eko-o-ni-baje',
    },
    storage: {
      endpoint: env.S3_ENDPOINT ?? 'http://localhost:58333',
      region: env.S3_REGION ?? 'us-east-1',
      accessKey: env.S3_ACCESS_KEY ?? '',
      secretKey: env.S3_SECRET_KEY ?? '',
      bucket: env.S3_BUCKET ?? 'insidelife-media',
      privateBucket: env.S3_PRIVATE_BUCKET ?? 'insidelife-private',
      publicBaseUrl: env.S3_PUBLIC_BASE_URL ?? '/media',
    },
    adminEmails: (env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
    paystack: {
      secretKey: env.PAYSTACK_SECRET_KEY ?? '',
      callbackUrl: env.PAYSTACK_CALLBACK_URL ?? '',
      dailyLimitNgn: Number(env.TOPUP_DAILY_LIMIT_NGN ?? 20_000),
      sandbox: !env.PAYSTACK_SECRET_KEY && (env.NODE_ENV !== 'production' || bool(env.ALLOW_PAYMENT_SANDBOX, false)),
    },
  };
};
