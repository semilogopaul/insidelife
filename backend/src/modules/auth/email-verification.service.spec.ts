import type { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/configuration.js';
import { DomainException } from '../../common/exceptions/domain.exception.js';
import type { MailService, OutgoingMail } from '../../common/mail/mail.service.js';
import {
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_CODE_TTL_MS,
  EMAIL_RESEND_COOLDOWN_MS,
  EMAIL_SENDS_PER_HOUR,
  EmailVerificationService,
  type VerifiableUser,
} from './email-verification.service.js';

/** The Redis commands the service uses, in memory, with expiries on the (fake) system clock. */
function fakeRedis() {
  const values = new Map<string, string | Map<string, string>>();
  const expiries = new Map<string, number>();
  const alive = (key: string): boolean => {
    const at = expiries.get(key);
    if (at !== undefined && at <= Date.now()) {
      values.delete(key);
      expiries.delete(key);
    }
    return values.has(key);
  };
  const hash = (key: string): Map<string, string> => {
    if (!alive(key)) values.set(key, new Map());
    return values.get(key) as Map<string, string>;
  };
  const string = (key: string): string | null => (alive(key) ? (values.get(key) as string) : null);
  const commands = {
    get: async (key: string) => string(key),
    set: async (key: string, value: string, _px: 'PX', ms: number, nx?: 'NX') => {
      if (nx && alive(key)) return null;
      values.set(key, value);
      expiries.set(key, Date.now() + ms);
      return 'OK';
    },
    pttl: async (key: string) => {
      if (!alive(key)) return -2;
      const at = expiries.get(key);
      return at === undefined ? -1 : at - Date.now();
    },
    pexpire: async (key: string, ms: number, nx?: 'NX') => {
      if (!alive(key) || (nx && expiries.has(key))) return 0;
      expiries.set(key, Date.now() + ms);
      return 1;
    },
    del: async (...keys: string[]) => {
      let removed = 0;
      for (const key of keys) {
        if (alive(key)) removed++;
        values.delete(key);
        expiries.delete(key);
      }
      return removed;
    },
    incr: async (key: string) => {
      const next = Number(string(key) ?? 0) + 1;
      values.set(key, String(next));
      return next;
    },
    decr: async (key: string) => {
      const next = Number(string(key) ?? 0) - 1;
      values.set(key, String(next));
      return next;
    },
    hset: async (key: string, ...pairs: string[]) => {
      const target = hash(key);
      for (let i = 0; i < pairs.length; i += 2) target.set(pairs[i]!, pairs[i + 1]!);
      return pairs.length / 2;
    },
    hget: async (key: string, field: string) =>
      alive(key) ? ((values.get(key) as Map<string, string>).get(field) ?? null) : null,
    hincrby: async (key: string, field: string, by: number) => {
      const target = hash(key);
      const next = Number(target.get(field) ?? 0) + by;
      target.set(field, String(next));
      return next;
    },
  };
  type Command = keyof typeof commands;
  const multi = () => {
    const queued: Array<() => Promise<unknown>> = [];
    const chain: Record<string, unknown> = {
      exec: async () => {
        const results: Array<[null, unknown]> = [];
        for (const run of queued) results.push([null, await run()]);
        return results;
      },
    };
    for (const name of Object.keys(commands) as Command[]) {
      chain[name] = (...args: unknown[]) => {
        queued.push(() => (commands[name] as (...a: unknown[]) => Promise<unknown>)(...args));
        return chain;
      };
    }
    return chain;
  };
  return { redis: { ...commands, multi } as unknown as Redis, values };
}

function setup(options: { smtp?: boolean; env?: AppConfig['env']; failMail?: boolean } = {}) {
  const { redis, values } = fakeRedis();
  const sent: OutgoingMail[] = [];
  const mail = {
    configured: options.smtp ?? true,
    send: vi.fn(async (message: OutgoingMail) => {
      if (options.failMail)
        throw new DomainException('EXTERNAL_SERVICE_ERROR', 'Email is not responding', 502);
      sent.push(message);
    }),
  } as unknown as MailService;
  const settings: Partial<AppConfig> = {
    env: options.env ?? 'development',
    auth: {
      accessSecret: 'test-secret-0123456789abcdef0123456789',
      accessTtlSeconds: 900,
      refreshTtlDays: 30,
      cookieSecure: false,
      requireEmailVerification: true,
    },
  };
  const config = { get: (key: keyof AppConfig) => settings[key] } as unknown as ConfigService<
    AppConfig,
    true
  >;
  const service = new EmailVerificationService(redis, mail, config);
  const lastCode = (): string => /code is: (\d{6})/.exec(sent.at(-1)?.text ?? '')?.[1] ?? '';
  return { service, sent, values, lastCode, mail };
}

const user: VerifiableUser = { id: 'u1', email: 'ada@example.com', emailVerifiedAt: null };
const errorCode = async (promise: Promise<unknown>): Promise<string> =>
  promise.then(
    () => 'ok',
    (error: unknown) => (error instanceof DomainException ? error.errorCode : 'unexpected'),
  );
const wrongCode = (code: string): string => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

describe('email verification codes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('emails a random 6-digit code and keeps only a hash of it', async () => {
    const { service, sent, values, lastCode } = setup();
    const status = await service.send(user);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(user.email);
    expect(lastCode()).toMatch(/^\d{6}$/);
    expect(sent[0]!.html).toContain(lastCode());
    // No tracking: no images, no links, nothing fetched when the email is opened.
    expect(sent[0]!.html).not.toMatch(/<img|src=|href=|url\(/i);
    expect(status.codeExpiresAt).toBe(Date.now() + EMAIL_CODE_TTL_MS);
    expect(status.resendAvailableAt).toBe(Date.now() + EMAIL_RESEND_COOLDOWN_MS);
    expect(status.devCode).toBeUndefined();
    const stored = JSON.stringify(
      [...values].map(([key, value]) => [key, value instanceof Map ? [...value] : value]),
    );
    expect(stored).not.toContain(lastCode());
  });

  it('accepts the right code once', async () => {
    const { service, lastCode } = setup();
    await service.send(user);
    const code = lastCode();
    expect(await errorCode(service.confirm(user, code))).toBe('ok');
    expect(await errorCode(service.confirm(user, code))).toBe('EMAIL_CODE_EXPIRED');
  });

  it('expires codes after 10 minutes', async () => {
    const { service, lastCode } = setup();
    await service.send(user);
    vi.advanceTimersByTime(EMAIL_CODE_TTL_MS + 1);
    expect(await errorCode(service.confirm(user, lastCode()))).toBe('EMAIL_CODE_EXPIRED');
    expect((await service.status(user)).codeExpiresAt).toBeNull();
  });

  it(`burns a code after ${EMAIL_CODE_MAX_ATTEMPTS} wrong tries, even if the right one comes next`, async () => {
    const { service, lastCode } = setup();
    await service.send(user);
    const code = lastCode();
    for (let i = 1; i < EMAIL_CODE_MAX_ATTEMPTS; i++) {
      await expect(service.confirm(user, wrongCode(code))).rejects.toThrow(
        `${EMAIL_CODE_MAX_ATTEMPTS - i} tr`,
      );
    }
    expect(await errorCode(service.confirm(user, wrongCode(code)))).toBe('EMAIL_CODE_EXPIRED');
    expect(await errorCode(service.confirm(user, code))).toBe('EMAIL_CODE_EXPIRED');
  });

  it('says no live code when none was sent', async () => {
    const { service } = setup();
    expect(await errorCode(service.confirm(user, '123456'))).toBe('EMAIL_CODE_EXPIRED');
    expect((await service.status(user)).codeExpiresAt).toBeNull();
  });

  it('allows a resend after 60 s, and the new code replaces the old one', async () => {
    const { service, lastCode } = setup();
    await service.send(user);
    const first = lastCode();
    vi.advanceTimersByTime(EMAIL_RESEND_COOLDOWN_MS - 1_000);
    expect(await errorCode(service.send(user))).toBe('EMAIL_CODE_RESEND_LIMITED');
    vi.advanceTimersByTime(1_000);
    await service.send(user);
    const second = lastCode();
    if (first !== second) expect(await errorCode(service.confirm(user, first))).toBe('EMAIL_CODE_INVALID');
    expect(await errorCode(service.confirm(user, second))).toBe('ok');
  });

  it(`sends at most ${EMAIL_SENDS_PER_HOUR} codes an hour`, async () => {
    const { service, sent } = setup();
    for (let i = 0; i < EMAIL_SENDS_PER_HOUR; i++) {
      await service.send(user);
      vi.advanceTimersByTime(EMAIL_RESEND_COOLDOWN_MS);
    }
    expect(await errorCode(service.send(user))).toBe('EMAIL_CODE_RESEND_LIMITED');
    const status = await service.status(user);
    expect(status.resendAvailableAt).toBe(Date.parse('2026-10-09T11:00:00Z'));
    vi.setSystemTime(new Date('2026-10-09T11:00:00Z'));
    await service.send(user);
    expect(sent).toHaveLength(EMAIL_SENDS_PER_HOUR + 1);
  });

  it('gives the send back when the email could not go out', async () => {
    const { service } = setup({ failMail: true });
    expect(await errorCode(service.send(user))).toBe('EXTERNAL_SERVICE_ERROR');
    const status = await service.status(user);
    expect(status.resendAvailableAt).toBe(Date.now());
    expect(status.codeExpiresAt).toBeNull();
  });

  it('returns the code as devCode only in development without SMTP', async () => {
    const dev = setup({ smtp: false });
    const status = await dev.service.send(user);
    expect(status.devCode).toMatch(/^\d{6}$/);
    expect(await errorCode(dev.service.confirm(user, status.devCode!))).toBe('ok');

    const prodWithoutSmtp = setup({ smtp: false, env: 'production' });
    expect((await prodWithoutSmtp.service.status(user)).available).toBe(false);
    expect(await errorCode(prodWithoutSmtp.service.send(user))).toBe('EMAIL_UNAVAILABLE');
    const prod = setup({ env: 'production' });
    expect((await prod.service.send(user)).devCode).toBeUndefined();
  });

  it('does nothing for an account that is already verified', async () => {
    const { service, sent } = setup();
    const verified = { ...user, emailVerifiedAt: new Date() };
    expect((await service.send(verified)).verified).toBe(true);
    expect(await errorCode(service.confirm(verified, '000000'))).toBe('ok');
    expect(sent).toHaveLength(0);
  });
});
