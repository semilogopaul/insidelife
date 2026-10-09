import { randomInt } from 'node:crypto';
import { keyedHash, sameDigest } from './secret-box.js';

/** No 0/o, 1/l/i: codes get written on paper and typed back. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const RECOVERY_CODE_COUNT = 10;
/** 10 characters from 31 ≈ 49.5 bits each. */
const CODE_LENGTH = 10;

/** `abcde-fgh23`: shown once, kept by the admin, each usable once instead of an authenticator code. */
export function newRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const chars = Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

/** Case, spaces and dashes don't matter when typing a code back. */
export function normaliseRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function hashRecoveryCode(key: Buffer, code: string): string {
  return keyedHash(key, normaliseRecoveryCode(code));
}

/** Index of the matching stored hash, or -1. Checks every hash (no early exit on a match). */
export function findRecoveryCode(key: Buffer, hashes: readonly string[], typed: string): number {
  const candidate = hashRecoveryCode(key, typed);
  let found = -1;
  hashes.forEach((hash, index) => {
    if (sameDigest(hash, candidate) && found === -1) found = index;
  });
  return found;
}
