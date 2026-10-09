import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { DomainException } from '../../../common/exceptions/domain.exception.js';

/** A 32-byte key for one purpose, derived from a configured secret (HKDF-SHA256). */
export function deriveKey(secret: string, purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, 'insidelife-admin', purpose, 32));
}

class SecretUnreadableException extends DomainException {
  constructor() {
    super('ADMIN_MFA_UNREADABLE', 'The authenticator for this account can’t be read. Ask an owner to reset it');
  }
}

/**
 * AES-256-GCM for small secrets at rest (admins' authenticator secrets). `context` (the user id) is bound as
 * associated data, so a ciphertext copied onto another account doesn't decrypt. Format: `v1.<iv>.<tag>.<data>`.
 */
export class SecretBox {
  constructor(private readonly key: Buffer) {}

  seal(plaintext: string, context: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(context));
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
  }

  open(sealed: string, context: string): string {
    const [version, iv, tag, data] = sealed.split('.');
    if (version !== 'v1' || !iv || !tag || !data) throw new SecretUnreadableException();
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
      throw new SecretUnreadableException();
    }
  }
}

/** Keyed hash (HMAC-SHA256, hex) for one-time recovery codes: a database leak alone can't test guesses offline. */
export function keyedHash(key: Buffer, value: string): string {
  return createHmac('sha256', key).update(value).digest('hex');
}

/** Constant-time comparison of two hex digests. */
export function sameDigest(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}
