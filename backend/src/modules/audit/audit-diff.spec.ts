import { describe, expect, it } from 'vitest';
import { auditChanges, auditMetadata } from './audit-diff.js';

describe('auditChanges', () => {
  it('keeps only the fields that changed', () => {
    const at = new Date('2026-10-09T10:00:00.000Z');
    expect(
      auditChanges({ status: 'active', email: 'a@b.c', suspendedAt: null }, { status: 'suspended', email: 'a@b.c', suspendedAt: at }),
    ).toEqual({
      before: { status: 'active', suspendedAt: null },
      after: { status: 'suspended', suspendedAt: '2026-10-09T10:00:00.000Z' },
    });
  });

  it('treats a field missing on one side as null and compares nested values by content', () => {
    expect(auditChanges({ meta: { a: 1, b: 2 } }, { meta: { b: 2, a: 1 }, note: 'x' })).toEqual({
      before: { note: null },
      after: { note: 'x' },
    });
  });

  it('records creation and removal as one-sided snapshots', () => {
    expect(auditChanges(null, { role: 'admin' })).toEqual({ before: null, after: { role: 'admin' } });
    expect(auditChanges({ role: 'admin' }, undefined)).toEqual({ before: { role: 'admin' }, after: null });
    expect(auditChanges(null, null)).toEqual({ before: null, after: null });
  });

  it('never stores secrets', () => {
    const result = auditChanges({ passwordHash: 'old', totpSecret: 'A' }, { passwordHash: 'new', totpSecret: 'B' });
    expect(JSON.stringify(result)).not.toMatch(/old|new|"A"|"B"/);
    expect(auditMetadata({ refreshToken: 'abc', count: 2 })).toEqual({ refreshToken: '[redacted]', count: 2 });
  });
});

describe('redaction', () => {
  it('hides real secrets but keeps counts and timestamps that only mention them', () => {
    expect(
      auditMetadata({
        recoveryCodesLeft: 9,
        recoveryCodesIssued: 10,
        recoveryCodes: ['abcde-fghij'],
        recoveryCodeHashes: ['x'],
        pendingSecret: 'S',
        otpauthUrl: 'otpauth://totp/x',
        code: '123456',
        tokenHash: 'h',
        previousTokenHash: 'p',
        password: 'pw',
        sessionsEnded: 2,
        passwordChangedAt: '2026-10-09T10:00:00.000Z',
      }),
    ).toEqual({
      recoveryCodesLeft: 9,
      recoveryCodesIssued: 10,
      recoveryCodes: '[redacted]',
      recoveryCodeHashes: '[redacted]',
      pendingSecret: '[redacted]',
      otpauthUrl: '[redacted]',
      code: '[redacted]',
      tokenHash: '[redacted]',
      previousTokenHash: '[redacted]',
      password: '[redacted]',
      sessionsEnded: 2,
      passwordChangedAt: '2026-10-09T10:00:00.000Z',
    });
  });
});
