import { describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import { redisOptionsFromUrl } from './redis-options.js';

describe('redisOptionsFromUrl', () => {
  it('reads host, port and password from a plain redis:// URL', () => {
    const options = redisOptionsFromUrl('redis://:s3cret@cache.internal:6380');
    expect(options).toMatchObject({ host: 'cache.internal', port: 6380, password: 's3cret' });
    expect(options.tls).toBeUndefined();
    expect(options.username).toBeUndefined();
  });

  it('turns TLS on for rediss:// (Azure Managed Redis, port 10000) with the host as SNI name', () => {
    const options = redisOptionsFromUrl('rediss://:a%2Bkey%3D@x.redis.azure.net:10000', { maxRetriesPerRequest: null });
    expect(options).toMatchObject({
      host: 'x.redis.azure.net',
      port: 10000,
      password: 'a+key=',
      tls: { servername: 'x.redis.azure.net' },
      maxRetriesPerRequest: null,
    });
  });

  it('supports a username and a database number', () => {
    expect(redisOptionsFromUrl('redis://app:pw@h:6379/11')).toMatchObject({ username: 'app', password: 'pw', db: 11 });
  });

  it('is understood by ioredis (a bare { url } option would fall back to localhost)', () => {
    const client = new Redis({ ...redisOptionsFromUrl('rediss://:k@r.example.com:10000'), lazyConnect: true });
    expect(client.options).toMatchObject({ host: 'r.example.com', port: 10000, password: 'k' });
    expect(client.options.tls).toBeTruthy();
    client.disconnect();
  });

  it('ioredis builds TLS from a rediss:// URL string itself (shared client, adapter pub/sub)', () => {
    const client = new Redis('rediss://:k@r.example.com:10000', { lazyConnect: true });
    expect(client.options).toMatchObject({ host: 'r.example.com', port: 10000 });
    expect(client.options.tls).toBeTruthy();
    client.disconnect();
  });
});
