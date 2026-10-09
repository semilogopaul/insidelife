/**
 * Typed configuration. Read through `ConfigService<AppConfig, true>` so every key is checked at compile time.
 */
export interface AppConfig {
  readonly env: 'development' | 'test' | 'production';
  readonly port: number;
  readonly corsOrigins: readonly string[];
  /** Reverse proxies in front of the API (Express `trust proxy`). */
  readonly trustProxyHops: number;
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
    /** Players must confirm their email (a code) before creating a character and playing. Off: verifying is optional. */
    readonly requireEmailVerification: boolean;
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
  readonly ads: {
    /** Sponsored phone app slots for sale (the catalog defines up to PHONE_APP_SLOT_LIMIT). */
    readonly phoneAppSlots: number;
  };
  readonly mail: {
    /** `smtp://user:pass@host:587` or `smtps://…:465`; empty when the host/port fields are used instead. */
    readonly smtpUrl: string;
    readonly host: string;
    readonly port: number;
    /** TLS from the first byte (port 465). Otherwise STARTTLS is used when the server offers it. */
    readonly secure: boolean;
    readonly user: string;
    readonly pass: string;
    /** Sender shown to players, e.g. `Inside Life <hello@insidelife.online>`. */
    readonly from: string;
  };
  readonly payments: {
    readonly flutterwave: {
      /** `FLWSECK_TEST-…` locally, `FLWSECK-…` live. Server-side only; never logged. */
      readonly secretKey: string;
      /** Shared secret Flutterwave sends verbatim in the `verif-hash` header of every webhook. */
      readonly webhookSecretHash: string;
    };
    /** Where Flutterwave sends the browser back after checkout (`…/payments/callback`). */
    readonly callbackUrl: string;
    /** Real-naira top-up cap per account per UTC day; 0 = no cap. */
    readonly dailyLimitNgn: number;
    /** Largest single top-up (real naira). */
    readonly maxTopupNgn: number;
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
    trustProxyHops: Number(env.TRUST_PROXY_HOPS ?? 1),
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
      requireEmailVerification: bool(env.REQUIRE_EMAIL_VERIFICATION, false),
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
    ads: {
      phoneAppSlots: Math.min(20, Math.max(0, Number.parseInt(env.PHONE_APP_AD_SLOTS ?? '10', 10) || 0)),
    },
    adminEmails: (env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
    mail: {
      smtpUrl: env.SMTP_URL ?? '',
      host: env.SMTP_HOST ?? '',
      port: Number(env.SMTP_PORT ?? 587),
      secure: bool(env.SMTP_SECURE, Number(env.SMTP_PORT ?? 587) === 465),
      user: env.SMTP_USER ?? '',
      pass: env.SMTP_PASS ?? '',
      from: env.MAIL_FROM || 'Inside Life <hello@insidelife.online>',
    },
    payments: {
      flutterwave: {
        secretKey: env.FLUTTERWAVE_SECRET_KEY ?? '',
        webhookSecretHash: env.FLUTTERWAVE_WEBHOOK_SECRET_HASH ?? '',
      },
      callbackUrl: env.PAYMENT_CALLBACK_URL || 'http://localhost:3100/payments/callback',
      dailyLimitNgn: Number(env.TOPUP_DAILY_LIMIT_NGN ?? 0),
      maxTopupNgn: Number(env.TOPUP_MAX_PER_PAYMENT_NGN ?? 10_000_000),
      sandbox: !env.FLUTTERWAVE_SECRET_KEY && (env.NODE_ENV !== 'production' || bool(env.ALLOW_PAYMENT_SANDBOX, false)),
    },
  };
};
