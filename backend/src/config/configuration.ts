import { parseClockRescales, type ClockRescale } from '@insidelife/shared';

/**
 * Typed configuration. Read through `ConfigService<AppConfig, true>` so every key is checked at compile time.
 */
export interface AppConfig {
  readonly env: 'development' | 'test' | 'production';
  readonly port: number;
  readonly corsOrigins: readonly string[];
  /** Origins of the separate admin portal (e.g. https://admin.insidelife.online). Allowed by CORS for the REST API only. */
  readonly adminOrigins: readonly string[];
  /** ADMIN_API_HOST: when set, the admin API answers only on this host (optional hardening; see docs/DEPLOY.md). */
  readonly adminApiHost: string | null;
  /** `public` = the live site (strict checks), `local` = a machine of yours. */
  readonly deployment: 'local' | 'public';
  /** Reverse proxies in front of the API (Express `trust proxy`). */
  readonly trustProxyHops: number;
  readonly logLevel: string;
  /** Realtime limits. */
  readonly realtime: {
    /** MAX_ONLINE_PLAYERS: players allowed online at once; a newcomer past it gets `world:full`. 0 = unlimited. */
    readonly maxOnlinePlayers: number;
  };
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
    /** Game minutes per real minute from the epoch (until the first rescale). */
    readonly timeScale: number;
    /** Later speed changes, each continuous with the clock before it. */
    readonly rescales: readonly ClockRescale[];
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
  readonly betting: {
    /** BETTING_SECRET (server-only seed of every result); empty → derived from the JWT secret with HKDF. */
    readonly secret: string;
    /** Largest stake per slip. */
    readonly maxStake: number;
    /** Default and highest daily loss limit (net losses per game day). */
    readonly dailyLossLimit: number;
  };
  readonly adminEmails: readonly string[];
  readonly admin: {
    /** Key that encrypts admins' authenticator secrets at rest (32+ chars; derived from the JWT secret when unset). */
    readonly mfaKey: string;
    /** Admin access tokens are short-lived (default 10 minutes). */
    readonly accessTtlSeconds: number;
    /** An admin session (after password + authenticator) ends this many hours after sign-in, whatever happens. */
    readonly sessionMaxHours: number;
    /** …or after this many minutes without activity. */
    readonly sessionIdleMinutes: number;
  };
  readonly accounts: {
    /** A deleted account can be restored for this many days; after that it is anonymised. */
    readonly restoreWindowDays: number;
  };
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
    /** Paying in US dollars (PAYMENTS_USD_ENABLED). The game stays in naira; prices convert at the owner's usd-rate. */
    readonly usd: {
      readonly enabled: boolean;
      /** Largest single dollar top-up (whole dollars). */
      readonly maxTopupUsd: number;
      /** Apple Pay and Google Pay for dollar payments (PAYMENTS_WALLETS_ENABLED; validation requires `enabled`). */
      readonly wallets: boolean;
    };
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
    adminOrigins: (env.ADMIN_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    adminApiHost: env.ADMIN_API_HOST?.trim().toLowerCase() || null,
    deployment: env.DEPLOYMENT === 'public' ? 'public' : 'local',
    trustProxyHops: Number(env.TRUST_PROXY_HOPS ?? 1),
    logLevel: env.LOG_LEVEL ?? 'info',
    realtime: { maxOnlinePlayers: Number(env.MAX_ONLINE_PLAYERS ?? 0) },
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
      timeScale: Number(env.GAME_TIME_SCALE ?? 60),
      rescales: parseClockRescales(env.GAME_TIME_RESCALES),
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
    betting: {
      secret: env.BETTING_SECRET?.trim() ?? '',
      maxStake: Number(env.BETTING_MAX_STAKE ?? 1_000_000),
      dailyLossLimit: Number(env.BETTING_DAILY_LOSS_LIMIT ?? 5_000_000),
    },
    adminEmails: (env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
    admin: {
      mfaKey: env.ADMIN_MFA_KEY ?? '',
      accessTtlSeconds: Number(env.ADMIN_ACCESS_TTL_SECONDS ?? 600),
      sessionMaxHours: Number(env.ADMIN_SESSION_MAX_HOURS ?? 12),
      sessionIdleMinutes: Number(env.ADMIN_SESSION_IDLE_MINUTES ?? 120),
    },
    accounts: {
      restoreWindowDays: Number(env.ACCOUNT_RESTORE_DAYS ?? 30),
    },
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
      usd: {
        enabled: bool(env.PAYMENTS_USD_ENABLED, false),
        maxTopupUsd: Number(env.TOPUP_MAX_PER_PAYMENT_USD ?? 5_000),
        wallets: bool(env.PAYMENTS_USD_ENABLED, false) && bool(env.PAYMENTS_WALLETS_ENABLED, false),
      },
      sandbox: !env.FLUTTERWAVE_SECRET_KEY && (env.NODE_ENV !== 'production' || bool(env.ALLOW_PAYMENT_SANDBOX, false)),
    },
  };
};
