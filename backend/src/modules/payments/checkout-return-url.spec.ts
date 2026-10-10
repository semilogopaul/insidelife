import { requestOrigin } from '../../common/http/request-origin.js';
import { canonicalOrigin, checkoutReturnUrl } from './checkout-rules.js';

const CALLBACK = 'https://insidelife.online/payments/callback';
const TUNNEL = 'https://x7k2p9-3100.uks1.devtunnels.ms';
const ALLOWED = ['https://insidelife.online', 'http://localhost:3100', `${TUNNEL}/`];
const dev = { httpsOnly: false };
const live = { httpsOnly: true };

describe('checkoutReturnUrl (Flutterwave redirect_url)', () => {
  it('uses the player’s origin when it is exactly one of ours, keeping the callback’s path', () => {
    expect(checkoutReturnUrl(TUNNEL, ALLOWED, CALLBACK, dev)).toBe(`${TUNNEL}/payments/callback`);
    expect(checkoutReturnUrl('http://localhost:3100', ALLOWED, CALLBACK, dev)).toBe('http://localhost:3100/payments/callback');
    expect(checkoutReturnUrl('https://insidelife.online', ALLOWED, CALLBACK, live)).toBe(CALLBACK);
    // A query on the configured callback survives.
    expect(checkoutReturnUrl(TUNNEL, ALLOWED, 'https://insidelife.online/payments/callback?src=fw', dev)).toBe(`${TUNNEL}/payments/callback?src=fw`);
  });

  it('falls back to PAYMENT_CALLBACK_URL for an origin that isn’t ours', () => {
    expect(checkoutReturnUrl('https://evil.example', ALLOWED, CALLBACK, dev)).toBe(CALLBACK);
    expect(checkoutReturnUrl('https://insidelife.online.evil.example', ALLOWED, CALLBACK, dev)).toBe(CALLBACK);
    expect(checkoutReturnUrl('https://evilinsidelife.online', ALLOWED, CALLBACK, dev)).toBe(CALLBACK);
    expect(checkoutReturnUrl('http://localhost:3101', ALLOWED, CALLBACK, dev)).toBe(CALLBACK);
    expect(checkoutReturnUrl('https://localhost:3100', ALLOWED, CALLBACK, dev)).toBe(CALLBACK);
    expect(checkoutReturnUrl(TUNNEL, [], CALLBACK, dev)).toBe(CALLBACK);
    // A wildcard entry is never an allowlist.
    expect(checkoutReturnUrl('https://evil.example', ['*'], CALLBACK, dev)).toBe(CALLBACK);
  });

  it('falls back for a missing or malformed origin', () => {
    for (const origin of [undefined, null, '', '   ', 'null', 'insidelife.online', '//insidelife.online', 'https://', 'https:/insidelife.online', 'https:\\\\insidelife.online', 'not a url', 'https://insidelife .online', 'https://insidelife.online:99999', 'x'.repeat(300)]) {
      expect(checkoutReturnUrl(origin, ALLOWED, CALLBACK, dev), String(origin)).toBe(CALLBACK);
    }
  });

  it('refuses an origin carrying a path, query, fragment or credentials', () => {
    for (const origin of [
      `${TUNNEL}/phish`,
      `${TUNNEL}/payments/callback`,
      `${TUNNEL}?next=https://evil.example`,
      `${TUNNEL}#x`,
      'https://user:pw@insidelife.online',
      'https://user@insidelife.online',
      'https://evil.example@insidelife.online',
      'https://insidelife.online@evil.example',
    ]) {
      expect(checkoutReturnUrl(origin, ALLOWED, CALLBACK, dev), origin).toBe(CALLBACK);
    }
  });

  it('refuses other schemes', () => {
    for (const origin of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://insidelife.online', 'file:///etc/passwd', 'ws://localhost:3100', 'intent://insidelife.online']) {
      expect(checkoutReturnUrl(origin, ALLOWED, CALLBACK, dev), origin).toBe(CALLBACK);
    }
  });

  it('allows http only off the live site (production is https-only, even for a listed origin)', () => {
    expect(checkoutReturnUrl('http://localhost:3100', ALLOWED, CALLBACK, dev)).toBe('http://localhost:3100/payments/callback');
    expect(checkoutReturnUrl('http://localhost:3100', ALLOWED, CALLBACK, live)).toBe(CALLBACK);
    expect(checkoutReturnUrl(TUNNEL, ALLOWED, CALLBACK, live)).toBe(`${TUNNEL}/payments/callback`);
    // Default options: development rules.
    expect(checkoutReturnUrl('http://localhost:3100', ALLOWED, CALLBACK)).toBe('http://localhost:3100/payments/callback');
  });

  it('normalises trailing slashes, case and default ports on both sides', () => {
    expect(checkoutReturnUrl(`${TUNNEL}/`, ALLOWED, CALLBACK, dev)).toBe(`${TUNNEL}/payments/callback`);
    expect(checkoutReturnUrl('HTTPS://InsideLife.Online/', ALLOWED, CALLBACK, live)).toBe(CALLBACK);
    expect(checkoutReturnUrl('https://insidelife.online:443', ALLOWED, CALLBACK, live)).toBe(CALLBACK);
    expect(checkoutReturnUrl(' https://insidelife.online ', ALLOWED, CALLBACK, live)).toBe(CALLBACK);
    expect(checkoutReturnUrl('https://insidelife.online', ['HTTPS://INSIDELIFE.ONLINE/'], 'http://localhost:3100/payments/callback', live)).toBe(CALLBACK);
  });

  it('builds the return from the canonical origin, never from the raw header', () => {
    expect(checkoutReturnUrl('https://X7K2P9-3100.uks1.devtunnels.ms//', ALLOWED, CALLBACK, dev)).toBe(`${TUNNEL}/payments/callback`);
  });
});

describe('canonicalOrigin', () => {
  it('reduces a bare origin to scheme://host[:port], or null', () => {
    expect(canonicalOrigin('HTTP://LocalHost:3100/')).toBe('http://localhost:3100');
    expect(canonicalOrigin('http://localhost:80')).toBe('http://localhost');
    expect(canonicalOrigin('http://[::1]:3100')).toBe('http://[::1]:3100');
    expect(canonicalOrigin('http://localhost:3100', true)).toBeNull();
    expect(canonicalOrigin('https://a.b/c')).toBeNull();
    expect(canonicalOrigin(undefined)).toBeNull();
  });
});

/** A request with these headers (names are case-insensitive, like Express's `request.get`). */
const request = (headers: Record<string, string>) => ({ get: (name: string): string | undefined => headers[name.toLowerCase()] });

describe('requestOrigin (the web origin the player is using)', () => {
  it('reads the Origin header first', () => {
    expect(requestOrigin(request({ origin: TUNNEL, referer: 'https://insidelife.online/play' }))).toBe(TUNNEL);
    expect(requestOrigin(request({ origin: ` ${TUNNEL} ` }))).toBe(TUNNEL);
  });

  it('falls back to the Referer’s origin (dropping its path and query)', () => {
    expect(requestOrigin(request({ referer: `${TUNNEL}/play?phone=bank#top` }))).toBe(TUNNEL);
    expect(requestOrigin(request({ origin: 'null', referer: 'http://localhost:3100/play' }))).toBe('http://localhost:3100');
  });

  it('is null when neither names an http(s) origin', () => {
    expect(requestOrigin(request({}))).toBeNull();
    expect(requestOrigin(request({ origin: 'null' }))).toBeNull();
    expect(requestOrigin(request({ referer: 'not a url' }))).toBeNull();
    expect(requestOrigin(request({ referer: 'android-app://com.example/' }))).toBeNull();
  });

  it('passes an Origin through unvalidated: checkoutReturnUrl is the gate', () => {
    const hostile = requestOrigin(request({ origin: 'https://evil.example' }));
    expect(hostile).toBe('https://evil.example');
    expect(checkoutReturnUrl(hostile, ALLOWED, CALLBACK, live)).toBe(CALLBACK);
  });
});
