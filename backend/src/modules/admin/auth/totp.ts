import { generate, generateSecret, generateURI, verify } from 'otplib';

/**
 * Time-based one-time passwords (RFC 6238) for admin sign-in: 6 digits, 30-second steps, SHA-1 — what every
 * authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password, Aegis…) expects. A thin wrapper
 * over `otplib` (MIT; uses the audited @noble/hashes and @scure/base) so the library can be swapped.
 */
export const TOTP_ISSUER = 'Inside Life Admin';
const PERIOD_SECONDS = 30;
/** One step either side (±30 s) for phone clocks that drift. */
const TOLERANCE_SECONDS = 30;

/** A new 160-bit secret, base32 (what the QR code and manual entry carry). */
export function newTotpSecret(): string {
  return generateSecret({ length: 20 });
}

/** `otpauth://totp/...` for the QR code. */
export function totpUri(secret: string, accountName: string): string {
  return generateURI({ issuer: TOTP_ISSUER, label: accountName, secret, period: PERIOD_SECONDS, digits: 6 });
}

/** otplib throws this when the last used step is ahead of now plus the tolerance (the server's clock went back). */
const isAfterTimeStepError = (error: unknown): boolean => error instanceof Error && error.name.startsWith('AfterTimeStep');

/**
 * Check a code. Returns the time step it belongs to (store it: a code from that step or earlier is a replay and is
 * refused next time), or null when it's wrong. Clock skew that leaves the last used step in the future counts as a
 * wrong code, never as a server error.
 */
export async function checkTotp(secret: string, code: string, lastUsedStep: number | null, nowMs = Date.now()): Promise<number | null> {
  const token = code.replace(/\D/g, '');
  if (token.length !== 6) return null;
  try {
    const result = await verify({
      secret,
      token,
      epoch: Math.floor(nowMs / 1000),
      period: PERIOD_SECONDS,
      epochTolerance: TOLERANCE_SECONDS,
      ...(lastUsedStep !== null ? { afterTimeStep: lastUsedStep } : {}),
    });
    return result.valid && 'timeStep' in result ? result.timeStep : null;
  } catch (error) {
    if (isAfterTimeStepError(error)) return null;
    throw error;
  }
}

/** The current code (tests and local tooling only). */
export function currentTotp(secret: string, nowMs = Date.now()): Promise<string> {
  return generate({ secret, epoch: Math.floor(nowMs / 1000), period: PERIOD_SECONDS });
}
