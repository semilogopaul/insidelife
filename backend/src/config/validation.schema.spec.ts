import { describe, expect, it } from 'vitest';
import { productionProblem } from './validation.schema.js';

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
      }),
    ).toBeNull();
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
});
