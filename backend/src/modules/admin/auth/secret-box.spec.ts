import { describe, expect, it } from 'vitest';
import { DomainException } from '../../../common/exceptions/domain.exception.js';
import { findRecoveryCode, hashRecoveryCode, newRecoveryCodes, normaliseRecoveryCode } from './recovery-codes.js';
import { SecretBox, deriveKey } from './secret-box.js';

describe('SecretBox', () => {
  const box = new SecretBox(deriveKey('a-long-test-secret-0123456789abcdef', 'mfa'));

  it('round-trips and never stores the plaintext', () => {
    const sealed = box.seal('JBSWY3DPEHPK3PXP', 'user-1');
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(box.open(sealed, 'user-1')).toBe('JBSWY3DPEHPK3PXP');
    expect(box.seal('same', 'user-1')).not.toBe(box.seal('same', 'user-1'));
  });

  it('refuses a ciphertext moved to another account, tampered with, or sealed with another key', () => {
    const sealed = box.seal('JBSWY3DPEHPK3PXP', 'user-1');
    expect(() => box.open(sealed, 'user-2')).toThrow(DomainException);
    expect(() => box.open(`${sealed.slice(0, -2)}AA`, 'user-1')).toThrow(DomainException);
    expect(() => new SecretBox(deriveKey('another-secret-0123456789abcdefgh', 'mfa')).open(sealed, 'user-1')).toThrow(DomainException);
    expect(() => box.open('garbage', 'user-1')).toThrow(DomainException);
  });

  it('derives different keys per purpose', () => {
    expect(deriveKey('s'.repeat(40), 'a').equals(deriveKey('s'.repeat(40), 'b'))).toBe(false);
  });
});

describe('recovery codes', () => {
  const key = deriveKey('a-long-test-secret-0123456789abcdef', 'recovery');

  it('makes ten distinct, readable codes', () => {
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[a-hj-km-np-z2-9]{5}-[a-hj-km-np-z2-9]{5}$/);
  });

  it('matches typed codes whatever the case, spaces or dashes', () => {
    const codes = newRecoveryCodes(3);
    const hashes = codes.map((code) => hashRecoveryCode(key, code));
    const typed = ` ${normaliseRecoveryCode(codes[1] ?? '').toUpperCase()} `;
    expect(findRecoveryCode(key, hashes, typed)).toBe(1);
    expect(findRecoveryCode(key, hashes, 'aaaaa-bbbbb')).toBe(-1);
  });
});
