import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Flutterwave v3 webhooks carry the secret hash configured in the dashboard, verbatim, in this header (there is no
 * body signature). Only someone who knows the hash can make a request we accept; what it says is still read back
 * from the API before any money moves.
 */
export const FLUTTERWAVE_HASH_HEADER = 'verif-hash';

const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

/**
 * Constant-time comparison of the `verif-hash` header with our secret (both hashed to a fixed length first, so
 * neither the content nor the length leaks through timing). False when no secret is configured, or the header is
 * missing, empty or repeated — never throws.
 */
export function isValidWebhookHash(header: string | readonly string[] | undefined, secret: string): boolean {
  if (!secret || typeof header !== 'string' || header.length === 0 || header.length > 512) return false;
  return timingSafeEqual(digest(header), digest(secret));
}
