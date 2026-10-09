import { generate } from 'otplib';
import { describe, expect, it } from 'vitest';
import { checkTotp, currentTotp, newTotpSecret, totpUri } from './totp.js';

describe('totp', () => {
  it('matches the RFC 6238 SHA-1 test vector (last 6 digits)', async () => {
    // RFC 6238 appendix B: secret "12345678901234567890", T = 59 s → 94287082.
    const secret = new TextEncoder().encode('12345678901234567890');
    expect(await generate({ secret, epoch: 59, digits: 8 })).toBe('94287082');
    expect(await generate({ secret, epoch: 59 })).toBe('287082');
  });

  it('accepts the current code and one step either side, nothing further', async () => {
    const secret = newTotpSecret();
    const now = 1_800_000_015_000;
    expect(await checkTotp(secret, await currentTotp(secret, now), null, now)).not.toBeNull();
    expect(await checkTotp(secret, await currentTotp(secret, now - 30_000), null, now)).not.toBeNull();
    expect(await checkTotp(secret, await currentTotp(secret, now + 30_000), null, now)).not.toBeNull();
    expect(await checkTotp(secret, await currentTotp(secret, now - 90_000), null, now)).toBeNull();
  });

  it('refuses a code from a step that was already used (replay)', async () => {
    const secret = newTotpSecret();
    const now = 1_800_000_015_000;
    const code = await currentTotp(secret, now);
    const step = await checkTotp(secret, code, null, now);
    expect(step).not.toBeNull();
    expect(await checkTotp(secret, code, step, now + 5_000)).toBeNull();
    expect(await checkTotp(secret, await currentTotp(secret, now + 30_000), step, now + 30_000)).not.toBeNull();
  });

  it('ignores spaces in typed codes and refuses junk', async () => {
    const secret = newTotpSecret();
    const now = 1_800_000_015_000;
    const code = await currentTotp(secret, now);
    expect(await checkTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, null, now)).not.toBeNull();
    expect(await checkTotp(secret, '12345', null, now)).toBeNull();
    expect(await checkTotp(secret, 'abcdef', null, now)).toBeNull();
  });

  it('builds an authenticator URI with the issuer and account', () => {
    const uri = totpUri('JBSWY3DPEHPK3PXP', 'admin@insidelife.ng');
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(decodeURIComponent(uri)).toContain('Inside Life Admin');
  });
});

describe('checkTotp and clock skew', () => {
  it('treats a last used step ahead of the clock as a wrong code, not a server error', async () => {
    const secret = newTotpSecret();
    const now = Date.UTC(2026, 9, 9, 12, 0, 0);
    const code = await currentTotp(secret, now);
    const step = Math.floor(now / 30_000);
    // The server's clock went back two minutes since the last sign-in: otplib would throw AfterTimeStepRangeExceeded.
    await expect(checkTotp(secret, code, step + 4, now)).resolves.toBeNull();
    // A normal check still works.
    await expect(checkTotp(secret, code, step - 1, now)).resolves.toBe(step);
  });
});
