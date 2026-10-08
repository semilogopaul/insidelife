import { createHmac, timingSafeEqual } from 'node:crypto';

/** Paystack signs webhooks with HMAC-SHA512 of the raw request body, keyed by the secret key, hex-encoded. */
export const PAYSTACK_SIGNATURE_HEADER = 'x-paystack-signature';

const SHA512_HEX = /^[0-9a-f]{128}$/i;

export function computePaystackSignature(rawBody: Buffer, secretKey: string): string {
  return createHmac('sha512', secretKey).update(rawBody).digest('hex');
}

/**
 * Constant-time check of `x-paystack-signature`. False when the secret is missing (sandbox), the body wasn't
 * captured, or the header is absent/malformed — never throws.
 */
export function isValidPaystackSignature(rawBody: Buffer | undefined, header: string | readonly string[] | undefined, secretKey: string): boolean {
  if (!secretKey || !rawBody || typeof header !== 'string' || !SHA512_HEX.test(header)) return false;
  const expected = Buffer.from(computePaystackSignature(rawBody, secretKey), 'hex');
  const given = Buffer.from(header, 'hex');
  return expected.length === given.length && timingSafeEqual(expected, given);
}
