import { describe, expect, it } from 'vitest';
import { productionProblem, validationSchema } from './validation.schema.js';

const live = {
  NODE_ENV: 'production',
  DEPLOYMENT: 'public' as const,
  PAYSTACK_SECRET_KEY: 'sk_live_abc123',
  PAYSTACK_CALLBACK_URL: 'https://insidelife.online/payments/callback',
  JWT_ACCESS_SECRET: 'q8Zr2LxVw9mP4tYb7Kc1Hn6Jd3Fg5Ss0Ue8Ai2Ox7Rk4Wl9Mz',
  CORS_ORIGINS: 'https://insidelife.online,https://www.insidelife.online',
  ALLOW_PAYMENT_SANDBOX: false,
  COOKIE_SECURE: true,
  MARKET_SEED: 'k3Jd9Lq2Xv7Rt5Pm1Wz8',
  S3_SECRET_KEY: 'Xp4Lk9Qz2Vb7Nm1Rt6Ws',
  SMTP_URL: 'smtp://hello%40insidelife.online:app-password@smtp-relay.brevo.com:587',
  ADMIN_ORIGINS: 'https://admin.insidelife.online',
  ADMIN_MFA_KEY: 'Zt7Qp2Lm9Xc4Vb8Nn1Ks6Dh3Fj5Gw0Ry',
};

describe('environment checks', () => {
  it('accepts a properly configured live site', () => {
    expect(productionProblem(live)).toBeNull();
  });

  it('never accepts a change-me signing key in production, sandbox or not', () => {
    expect(
      productionProblem({
        ...live,
        DEPLOYMENT: 'local',
        ALLOW_PAYMENT_SANDBOX: true,
        JWT_ACCESS_SECRET: 'change-me-0123456789abcdef0123456789',
      }),
    ).toMatch(/JWT_ACCESS_SECRET/);
  });

  it('keeps the local docker stack bootable', () => {
    expect(
      productionProblem({
        ...live,
        DEPLOYMENT: 'local',
        ALLOW_PAYMENT_SANDBOX: true,
        PAYSTACK_SECRET_KEY: '',
        COOKIE_SECURE: false,
        JWT_ACCESS_SECRET: 'local-docker-secret-please-change-0123456789abcdef',
        CORS_ORIGINS: 'http://localhost:8080',
        SMTP_URL: '',
      }),
    ).toBeNull();
  });

  it('boots without a mail server while email verification is optional', () => {
    expect(productionProblem({ ...live, SMTP_URL: '' })).toBeNull();
    expect(productionProblem({ ...live, SMTP_URL: '', REQUIRE_EMAIL_VERIFICATION: false })).toBeNull();
  });

  it('needs a real mail server in production once email verification is required', () => {
    const strict = { ...live, REQUIRE_EMAIL_VERIFICATION: true };
    expect(productionProblem(strict)).toBeNull();
    expect(productionProblem({ ...strict, SMTP_URL: '' })).toMatch(/SMTP_URL/);
    expect(productionProblem({ ...strict, SMTP_URL: '', SMTP_HOST: 'smtp.zoho.com' })).toBeNull();
    expect(productionProblem({ ...strict, DEPLOYMENT: 'local', ALLOW_PAYMENT_SANDBOX: true, SMTP_URL: '' })).toMatch(/SMTP_URL/);
    expect(productionProblem({ ...live, SMTP_URL: 'smtp://mailpit:1025' })).toMatch(/mail catcher/);
    // Development may run without SMTP either way (codes are logged).
    expect(productionProblem({ ...strict, NODE_ENV: 'development', DEPLOYMENT: 'local', SMTP_URL: '' })).toBeNull();
  });

  it('refuses the live site with sandbox payments, insecure cookies, placeholder secrets or http origins', () => {
    expect(productionProblem({ ...live, ALLOW_PAYMENT_SANDBOX: true })).toMatch(/SANDBOX/);
    expect(productionProblem({ ...live, COOKIE_SECURE: false })).toMatch(/COOKIE_SECURE/);
    expect(
      productionProblem({ ...live, JWT_ACCESS_SECRET: 'local-docker-secret-please-change-0123456789abcdef' }),
    ).toMatch(/JWT/);
    expect(productionProblem({ ...live, JWT_ACCESS_SECRET: 'a'.repeat(64) })).toMatch(/JWT/);
    expect(productionProblem({ ...live, MARKET_SEED: undefined })).toMatch(/MARKET_SEED/);
    expect(productionProblem({ ...live, S3_SECRET_KEY: 'insidelife-storage-secret' })).toMatch(
      /S3_SECRET_KEY/,
    );
    expect(productionProblem({ ...live, CORS_ORIGINS: 'http://insidelife.online' })).toMatch(/https/);
    expect(productionProblem({ ...live, PAYSTACK_SECRET_KEY: '' })).toMatch(/PAYSTACK/);
  });

  it('needs https admin origins and a private authenticator key on the live site', () => {
    expect(productionProblem({ ...live, ADMIN_ORIGINS: 'http://admin.insidelife.online' })).toMatch(/ADMIN_ORIGINS/);
    expect(productionProblem({ ...live, ADMIN_ORIGINS: '' })).toBeNull();
    expect(productionProblem({ ...live, ADMIN_MFA_KEY: undefined })).toMatch(/ADMIN_MFA_KEY/);
    expect(productionProblem({ ...live, ADMIN_MFA_KEY: 'change-me-change-me-change-me-change-me' })).toMatch(/ADMIN_MFA_KEY/);
    // Locally the key is optional (derived from the JWT secret) and http origins are fine.
    expect(
      productionProblem({ ...live, DEPLOYMENT: 'local', NODE_ENV: 'development', ADMIN_MFA_KEY: undefined, ADMIN_ORIGINS: 'http://localhost:5174' }),
    ).toBeNull();
  });

  it('accepts only plain origins in ADMIN_ORIGINS', () => {
    const base = {
      CORS_ORIGINS: 'http://localhost:3100',
      DATABASE_URL: 'postgres://u:p@localhost:5432/db',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'x'.repeat(40),
      GAME_EPOCH: '2026-10-01T00:00:00.000Z',
      WORLD_SEED: 'eko-o-ni-baje',
      PAYSTACK_CALLBACK_URL: 'http://localhost:3100/payments/callback',
      S3_ENDPOINT: 'http://localhost:58333',
      S3_ACCESS_KEY: 'insidelife',
      S3_SECRET_KEY: 'local-secret-123',
      S3_BUCKET: 'insidelife-media',
      S3_PUBLIC_BASE_URL: '/media',
    };
    expect(validationSchema.validate({ ...base, ADMIN_ORIGINS: 'http://localhost:5174, https://admin.insidelife.online' }).error).toBeUndefined();
    expect(validationSchema.validate({ ...base, ADMIN_ORIGINS: 'https://admin.insidelife.online/path' }).error?.message).toMatch(/ADMIN_ORIGINS/);
    expect(validationSchema.validate({ ...base, ADMIN_ORIGINS: '*' }).error?.message).toMatch(/ADMIN_ORIGINS/);
  });
});
