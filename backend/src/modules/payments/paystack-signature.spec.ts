import { createHmac } from 'node:crypto';
import { computePaystackSignature, isValidPaystackSignature } from './paystack-signature.js';

const SECRET = 'sk_test_fake';
const body = Buffer.from(JSON.stringify({ event: 'charge.success', data: { reference: 'abc', amount: 50_000, currency: 'NGN', status: 'success' } }));
const sign = (raw: Buffer, secret = SECRET): string => createHmac('sha512', secret).update(raw).digest('hex');

describe('Paystack webhook signature', () => {
  it('computes HMAC-SHA512 of the raw body, hex-encoded', () => {
    expect(computePaystackSignature(body, SECRET)).toBe(sign(body));
    expect(computePaystackSignature(body, SECRET)).toHaveLength(128);
  });

  it('accepts the correct signature (any hex case)', () => {
    expect(isValidPaystackSignature(body, sign(body), SECRET)).toBe(true);
    expect(isValidPaystackSignature(body, sign(body).toUpperCase(), SECRET)).toBe(true);
  });

  it('rejects a signature made with another key', () => {
    expect(isValidPaystackSignature(body, sign(body, 'sk_test_attacker'), SECRET)).toBe(false);
  });

  it('rejects a tampered body (re-serialised JSON is not the signed bytes)', () => {
    const tampered = Buffer.from(body.toString().replace('50000', '5000000'));
    expect(isValidPaystackSignature(tampered, sign(body), SECRET)).toBe(false);
    const reformatted = Buffer.from(JSON.stringify(JSON.parse(body.toString()), null, 2));
    expect(isValidPaystackSignature(reformatted, sign(body), SECRET)).toBe(false);
  });

  it('rejects missing, malformed, truncated or array headers without throwing', () => {
    const good = sign(body);
    expect(isValidPaystackSignature(body, undefined, SECRET)).toBe(false);
    expect(isValidPaystackSignature(body, '', SECRET)).toBe(false);
    expect(isValidPaystackSignature(body, 'not-hex', SECRET)).toBe(false);
    expect(isValidPaystackSignature(body, good.slice(0, 64), SECRET)).toBe(false);
    expect(isValidPaystackSignature(body, [good], SECRET)).toBe(false);
  });

  it('rejects everything when no secret is configured (sandbox) or the raw body is missing', () => {
    expect(isValidPaystackSignature(body, sign(body, ''), '')).toBe(false);
    expect(isValidPaystackSignature(undefined, sign(body), SECRET)).toBe(false);
  });
});
