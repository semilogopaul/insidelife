import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { Redis } from 'ioredis';
import { EMAIL_CODE_LENGTH, isEmailCode, type EmailVerificationDto } from '@insidelife/shared';
import type { AppConfig } from '../../config/configuration.js';
import { MailService } from '../../common/mail/mail.service.js';
import { REDIS } from '../../common/redis/redis.module.js';
import {
  EmailCodeExpiredException,
  EmailCodeInvalidException,
  EmailCodeResendLimitedException,
  EmailUnavailableException,
} from './auth.exceptions.js';
import { verificationEmail } from './mail/verification-email.js';

/** A code works for 10 minutes. */
export const EMAIL_CODE_TTL_MS = 10 * 60_000;
/** Wrong guesses allowed per code; the fifth wrong one burns it. */
export const EMAIL_CODE_MAX_ATTEMPTS = 5;
/** Minimum gap between two sends to the same account. */
export const EMAIL_RESEND_COOLDOWN_MS = 60_000;
/** Sends per account per rolling hour (counted from the first send of the window). */
export const EMAIL_SENDS_PER_HOUR = 5;
const HOUR_MS = 3_600_000;

/** What the service needs to know about the account. */
export interface VerifiableUser {
  readonly id: string;
  readonly email: string;
  readonly emailVerifiedAt: Date | null;
}

const keys = (userId: string) => ({
  code: `auth:email-code:${userId}`,
  cooldown: `auth:email-code:cooldown:${userId}`,
  sends: `auth:email-code:sends:${userId}`,
});

/**
 * One-time codes that prove a player owns their email address. Codes are random (crypto), stored only as an HMAC in
 * Redis (a leaked Redis dump can't be turned back into codes), expire after 10 minutes and die after 5 wrong tries.
 * Sending is rate limited per account: one per minute, five per hour. Every counter is a Redis key with a TTL, so the
 * limits hold across API nodes and clean themselves up.
 *
 * Without SMTP settings in development the code is logged and returned as `devCode`, so the flow can be tested
 * locally and end to end. Without SMTP in production (allowed while verification is optional) nothing can be sent.
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);
  private readonly secret: string;
  private readonly devMode: boolean;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly mail: MailService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.secret = config.get('auth', { infer: true }).accessSecret;
    this.devMode = !mail.configured && config.get('env', { infer: true }) !== 'production';
  }

  /** Codes can go out: SMTP is set up, or this is development (logged instead). */
  get available(): boolean {
    return this.mail.configured || this.devMode;
  }

  async status(user: VerifiableUser): Promise<EmailVerificationDto> {
    const now = Date.now();
    const available = this.available;
    if (user.emailVerifiedAt)
      return { email: user.email, verified: true, available, codeExpiresAt: null, resendAvailableAt: now };
    const key = keys(user.id);
    const [codeTtl, cooldownTtl, sends, sendsTtl] = await Promise.all([
      this.redis.pttl(key.code),
      this.redis.pttl(key.cooldown),
      this.redis.get(key.sends),
      this.redis.pttl(key.sends),
    ]);
    return {
      email: user.email,
      verified: false,
      available,
      codeExpiresAt: codeTtl > 0 ? now + codeTtl : null,
      resendAvailableAt:
        now + Math.max(0, cooldownTtl, Number(sends ?? 0) >= EMAIL_SENDS_PER_HOUR ? sendsTtl : 0),
    };
  }

  /** Email a fresh code (replacing any earlier one). Refused while the per-minute or per-hour limit holds. */
  async send(user: VerifiableUser): Promise<EmailVerificationDto> {
    if (user.emailVerifiedAt) return this.status(user);
    if (!this.available) throw new EmailUnavailableException();
    const key = keys(user.id);

    const [sends, sendsTtl] = await Promise.all([this.redis.get(key.sends), this.redis.pttl(key.sends)]);
    if (Number(sends ?? 0) >= EMAIL_SENDS_PER_HOUR && sendsTtl > 0)
      throw new EmailCodeResendLimitedException(sendsTtl);
    // Claiming the cooldown is the lock: two simultaneous sends can't both pass.
    if ((await this.redis.set(key.cooldown, '1', 'PX', EMAIL_RESEND_COOLDOWN_MS, 'NX')) !== 'OK') {
      throw new EmailCodeResendLimitedException(Math.max(1, await this.redis.pttl(key.cooldown)));
    }

    const code = randomInt(0, 10 ** EMAIL_CODE_LENGTH)
      .toString()
      .padStart(EMAIL_CODE_LENGTH, '0');
    await this.redis
      .multi()
      .incr(key.sends)
      .pexpire(key.sends, HOUR_MS, 'NX')
      .del(key.code)
      .hset(key.code, 'hash', this.hash(user.id, code), 'attempts', '0')
      .pexpire(key.code, EMAIL_CODE_TTL_MS)
      .exec();

    try {
      await this.deliver(user, code);
    } catch (error) {
      // Nothing reached the player: give the attempt back so they can retry straight away.
      await this.redis.multi().del(key.cooldown).decr(key.sends).del(key.code).exec();
      throw error;
    }
    const status = await this.status(user);
    return this.devMode ? { ...status, devCode: code } : status;
  }

  /** Check a code. Right: the code is used up. Wrong: one try fewer; the last wrong try burns the code. */
  async confirm(user: VerifiableUser, code: string): Promise<void> {
    if (user.emailVerifiedAt) return;
    if (!isEmailCode(code)) throw new EmailCodeInvalidException(EMAIL_CODE_MAX_ATTEMPTS);
    const key = keys(user.id).code;

    // One atomic step: count this try and read the code, so parallel guesses can't share a try.
    const results = await this.redis.multi().hincrby(key, 'attempts', 1).hget(key, 'hash').pttl(key).exec();
    const attempts = Number(results?.[0]?.[1] ?? 0);
    const stored = results?.[1]?.[1];
    const ttl = Number(results?.[2]?.[1] ?? -2);
    if (typeof stored !== 'string' || ttl <= 0) {
      // Counting the try created an empty key (no live code): remove it again.
      await this.redis.del(key);
      throw new EmailCodeExpiredException();
    }
    if (attempts > EMAIL_CODE_MAX_ATTEMPTS) {
      await this.redis.del(key);
      throw new EmailCodeExpiredException('Too many wrong tries. Ask for a new code');
    }
    if (this.matches(stored, this.hash(user.id, code))) {
      await this.redis.del(key);
      return;
    }
    const triesLeft = EMAIL_CODE_MAX_ATTEMPTS - attempts;
    if (triesLeft <= 0) {
      await this.redis.del(key);
      throw new EmailCodeExpiredException('Too many wrong tries. Ask for a new code');
    }
    throw new EmailCodeInvalidException(triesLeft);
  }

  /** Forget everything about this account's codes (after verifying). */
  async clear(userId: string): Promise<void> {
    const key = keys(userId);
    await this.redis.del(key.code, key.cooldown, key.sends);
  }

  private async deliver(user: VerifiableUser, code: string): Promise<void> {
    const minutes = EMAIL_CODE_TTL_MS / 60_000;
    if (this.mail.configured) return this.mail.send(verificationEmail(user.email, code, minutes));
    this.logger.warn(`[dev] SMTP is not configured. Email code for ${user.email}: ${code}`);
  }

  private hash(userId: string, code: string): string {
    return createHmac('sha256', this.secret).update(`email-code:${userId}:${code}`).digest('hex');
  }

  private matches(stored: string, candidate: string): boolean {
    const a = Buffer.from(stored, 'hex');
    const b = Buffer.from(candidate, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
