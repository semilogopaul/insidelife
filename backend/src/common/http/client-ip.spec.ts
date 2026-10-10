import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { clientIpFromHeader, clientIpMiddleware } from './client-ip.js';
import { requestMetaOf } from '../decorators/request-meta.decorator.js';

describe('clientIpFromHeader', () => {
  it('reads and validates the header', () => {
    expect(clientIpFromHeader({ headers: { 'cf-connecting-ip': '203.0.113.9' } }, 'cf-connecting-ip')).toBe('203.0.113.9');
    expect(clientIpFromHeader({ headers: { 'cf-connecting-ip': '2606:4700::1' } }, 'CF-Connecting-IP')).toBe('2606:4700::1');
    expect(clientIpFromHeader({ headers: { 'cf-connecting-ip': '::ffff:203.0.113.9' } }, 'cf-connecting-ip')).toBe('203.0.113.9');
  });

  it('takes the first value of a list and ignores junk or a missing header', () => {
    expect(clientIpFromHeader({ headers: { 'x-real': '198.51.100.1, 10.0.0.1' } }, 'x-real')).toBe('198.51.100.1');
    expect(clientIpFromHeader({ headers: { 'x-real': 'not-an-ip' } }, 'x-real')).toBeNull();
    expect(clientIpFromHeader({ headers: {} }, 'x-real')).toBeNull();
  });
});

describe('clientIpMiddleware', () => {
  let server: ReturnType<ReturnType<typeof express>['listen']> | undefined;
  afterEach(() => server?.close());

  async function ipSeenBy(options: { header?: string; trustProxy?: number }, headers: Record<string, string>) {
    const app = express();
    app.set('trust proxy', options.trustProxy ?? 0);
    if (options.header) app.use(clientIpMiddleware(options.header));
    app.get('/ip', (request, response) => {
      response.json({ ip: request.ip, meta: requestMetaOf(request).ip });
    });
    server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/ip`, { headers });
    return (await response.json()) as { ip: string; meta: string };
  }

  it('makes req.ip (throttler tracker, auth limits, audit meta) the header value', async () => {
    const seen = await ipSeenBy({ header: 'cf-connecting-ip', trustProxy: 1 }, { 'CF-Connecting-IP': '203.0.113.9', 'X-Forwarded-For': '10.1.1.1' });
    expect(seen).toEqual({ ip: '203.0.113.9', meta: '203.0.113.9' });
  });

  it('falls back to trust proxy when the header is absent or invalid', async () => {
    expect((await ipSeenBy({ header: 'cf-connecting-ip', trustProxy: 1 }, { 'X-Forwarded-For': '198.51.100.7' })).ip).toBe('198.51.100.7');
    expect((await ipSeenBy({ header: 'cf-connecting-ip', trustProxy: 1 }, { 'CF-Connecting-IP': 'junk', 'X-Forwarded-For': '198.51.100.7' })).ip).toBe('198.51.100.7');
  });

  it('is inert when not installed: current TRUST_PROXY_HOPS behaviour, header ignored', async () => {
    const seen = await ipSeenBy({ trustProxy: 1 }, { 'CF-Connecting-IP': '203.0.113.9', 'X-Forwarded-For': '198.51.100.7' });
    expect(seen.ip).toBe('198.51.100.7');
  });
});
