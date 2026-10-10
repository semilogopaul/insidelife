import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { RateLimitedException } from '../../common/exceptions/domain.exception.js';
import { REDIS } from '../../common/redis/redis.module.js';

/** A player's check of one payment reaches Flutterwave at most once per this long; repeats get the stored state. */
export const CHECK_DEBOUNCE_MS = 5_000;
/**
 * Checks that reach Flutterwave, per account per minute (all its payments together). Debounced repeats don't count, so
 * tapping "check now" on one payment can never hit it (one payment can't be asked more than 12 times a minute).
 */
export const CHECKS_PER_MINUTE = 15;
const WINDOW_MS = 60_000;

/** `check`: ask the gateway now. `debounced`: it was asked moments ago (another tap, another tab): use what we have. */
export type CheckSlot = 'check' | 'debounced';

const referenceKey = (reference: string): string => `payments:check:ref:${reference}`;
const userKey = (userId: string): string => `payments:check:user:${userId}`;

/**
 * Makes "I've paid: check now" safe to press often: a per-payment debounce and a per-account rate limit (Redis, so
 * they hold across API nodes). The reconciler and webhooks never go through it. Fails open: if Redis is down, the
 * player can still confirm their payment.
 */
@Injectable()
export class PaymentCheckLimiter {
  private readonly logger = new Logger(PaymentCheckLimiter.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** May this player's check of `reference` ask the gateway now? Throws `RateLimitedException` past the account limit. */
  async claim(userId: string, reference: string): Promise<CheckSlot> {
    let count: number;
    try {
      // Claim the payment's window first: concurrent taps on one payment make one gateway call between them.
      if ((await this.redis.set(referenceKey(reference), '1', 'PX', CHECK_DEBOUNCE_MS, 'NX')) !== 'OK') return 'debounced';
      // Fixed one-minute window per account, created with its expiry atomically (a crash can't leave it without one).
      const results = await this.redis.multi().set(userKey(userId), '0', 'PX', WINDOW_MS, 'NX').incr(userKey(userId)).exec();
      count = Number(results?.[1]?.[1] ?? 0);
    } catch (error) {
      this.logger.warn({ err: error, reference }, 'Payment check limiter unavailable; checking anyway');
      return 'check';
    }
    if (count <= CHECKS_PER_MINUTE) return 'check';
    // Refused: this tap didn't check, so it mustn't hold the payment's window either.
    await this.release(reference);
    throw new RateLimitedException('You’ve checked a lot in the last minute. Give it a moment: if you paid, it’s safe, and we keep checking for you.');
  }

  /** The gateway couldn't be asked (or the check was refused): the next tap may try again at once. */
  async release(reference: string): Promise<void> {
    try {
      await this.redis.del(referenceKey(reference));
    } catch (error) {
      this.logger.warn({ err: error, reference }, 'Could not release a payment check');
    }
  }
}
