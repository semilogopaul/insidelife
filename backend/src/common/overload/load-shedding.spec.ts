import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';
import type { MetricsService } from '../../metrics/metrics.service.js';
import { isNeverShed, loadShedding } from './load-shedding.js';
import { OVERLOAD_RETRY_AFTER_SECONDS, OverloadMonitor } from './overload-monitor.service.js';

describe('loadShedding', () => {
  let server: ReturnType<ReturnType<typeof express>['listen']> | undefined;
  afterEach(() => server?.close());

  async function start(monitor: { overloaded: boolean }, onShed = vi.fn()) {
    const app = express();
    app.use(loadShedding(monitor, onShed));
    app.all(/.*/, (_request, response) => {
      response.json({ handled: true });
    });
    server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    return { base: `http://127.0.0.1:${port}`, onShed };
  }

  it('answers new requests at once with 503 SERVER_BUSY and Retry-After while overloaded', async () => {
    const { base, onShed } = await start({ overloaded: true });
    const response = await fetch(`${base}/api/v1/characters/me`, { headers: { 'x-trace-id': 'trace-abcdef12' } });
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe(String(OVERLOAD_RETRY_AFTER_SECONDS));
    expect(response.headers.get('x-trace-id')).toBe('trace-abcdef12');
    expect(await response.json()).toEqual({
      errorCode: 'SERVER_BUSY',
      message: expect.any(String),
      timestamp: expect.any(String),
      traceId: 'trace-abcdef12',
    });
    expect(onShed).toHaveBeenCalledTimes(1);
  });

  it('never sheds health, metrics, the Flutterwave webhook or the token refresh', async () => {
    const { base, onShed } = await start({ overloaded: true });
    for (const path of ['/api/health', '/api/metrics', '/api/v1/payments/flutterwave/webhook', '/api/v1/auth/refresh']) {
      const response = await fetch(`${base}${path}`, { method: path.includes('health') || path.includes('metrics') ? 'GET' : 'POST' });
      expect(response.status, path).toBe(200);
    }
    expect(onShed).not.toHaveBeenCalled();
  });

  it('lets everything through when the node is not overloaded', async () => {
    const monitor = { overloaded: false };
    const { base } = await start(monitor);
    expect((await fetch(`${base}/api/v1/visits`)).status).toBe(200);
    monitor.overloaded = true;
    expect((await fetch(`${base}/api/v1/visits`)).status).toBe(503);
    monitor.overloaded = false;
    expect((await fetch(`${base}/api/v1/visits`)).status).toBe(200);
  });

  it('matches exempt paths exactly, not by prefix of a longer word', () => {
    expect(isNeverShed('/api/health')).toBe(true);
    expect(isNeverShed('/api/health/live')).toBe(true);
    expect(isNeverShed('/api/v1/auth/refresh')).toBe(true);
    expect(isNeverShed('/api/v1/auth/refreshing')).toBe(false);
    expect(isNeverShed('/api/v1/auth/login')).toBe(false);
    expect(isNeverShed('/api/v1/payments/flutterwave/webhooks-fake')).toBe(false);
  });
});

describe('OverloadMonitor', () => {
  const monitor = (lagMs: number) => {
    const gauge = { set: vi.fn() };
    const config = { get: () => ({ lagMs }) } as unknown as ConfigService<AppConfig, true>;
    return { monitor: new OverloadMonitor(config, { eventLoopDelayP99: gauge } as unknown as MetricsService), gauge };
  };

  it('is overloaded while a window’s p99 delay is over the threshold, and recovers on the next quiet window', () => {
    const { monitor: m, gauge } = monitor(150);
    expect(m.overloaded).toBe(false);
    m.record(120);
    expect(m.overloaded).toBe(false);
    m.record(151);
    expect(m.overloaded).toBe(true);
    expect(m.lagMs).toBe(151);
    m.record(400);
    expect(m.overloaded).toBe(true);
    m.record(90);
    expect(m.overloaded).toBe(false);
    expect(gauge.set).toHaveBeenLastCalledWith(0.09);
  });

  it('never sheds with OVERLOAD_LAG_MS=0', () => {
    const { monitor: m } = monitor(0);
    m.record(10_000);
    expect(m.overloaded).toBe(false);
    m.onApplicationBootstrap(); // no histogram, no timer
    m.onModuleDestroy();
  });
});
