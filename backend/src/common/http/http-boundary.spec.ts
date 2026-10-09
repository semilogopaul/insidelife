import { Controller, Get, HttpCode, Post, VersioningType, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { adminRequestRefusal, configureHttpBoundary, isAdminPath, type HttpBoundaryPolicy } from './http-boundary.js';

const GAME = 'https://insidelife.online';
const ADMIN = 'https://admin.insidelife.online';

@Controller({ path: 'admin/auth', version: '1' })
class AdminProbeController {
  @Post('refresh')
  @HttpCode(200)
  refresh(): { reached: string } {
    return { reached: 'admin refresh' };
  }

  @Get('me')
  me(): { reached: string } {
    return { reached: 'admin me' };
  }
}

@Controller({ path: 'players', version: '1' })
class GameProbeController {
  @Post('me/actions')
  @HttpCode(200)
  act(): { reached: string } {
    return { reached: 'game action' };
  }
}

const policy = (overrides: Partial<HttpBoundaryPolicy> = {}): HttpBoundaryPolicy => ({
  gameOrigins: [GAME],
  adminOrigins: [ADMIN],
  requireAdminOrigin: true,
  adminApiHost: null,
  ...overrides,
});

let app: INestApplication | null = null;

/** The same wiring as main.ts: the boundary, then the /api prefix and URI versioning. */
async function appWith(boundary: HttpBoundaryPolicy) {
  const moduleRef = await Test.createTestingModule({ controllers: [AdminProbeController, GameProbeController] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  configureHttpBoundary(app, boundary);
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  await app.init();
  return request(app.getHttpServer());
}

afterEach(async () => {
  await app?.close();
  app = null;
});

describe('CORS is scoped per route', () => {
  it('lets only the admin portal call the admin API from a browser', async () => {
    const http = await appWith(policy());
    const fromAdmin = await http.options('/api/v1/admin/auth/refresh').set('Origin', ADMIN).set('Access-Control-Request-Method', 'POST');
    expect(fromAdmin.headers['access-control-allow-origin']).toBe(ADMIN);
    expect(fromAdmin.headers['access-control-allow-credentials']).toBe('true');
    const fromGame = await http.options('/api/v1/admin/auth/refresh').set('Origin', GAME).set('Access-Control-Request-Method', 'POST');
    expect(fromGame.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('lets only the game call the game’s routes', async () => {
    const http = await appWith(policy());
    const fromGame = await http.options('/api/v1/players/me/actions').set('Origin', GAME).set('Access-Control-Request-Method', 'POST');
    expect(fromGame.headers['access-control-allow-origin']).toBe(GAME);
    const fromAdmin = await http.options('/api/v1/players/me/actions').set('Origin', ADMIN).set('Access-Control-Request-Method', 'POST');
    expect(fromAdmin.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('Admin API requests must come from the admin portal', () => {
  it('refuses a POST from the game’s origin (what a script injected into the game would send)', async () => {
    const http = await appWith(policy());
    const response = await http.post('/api/v1/admin/auth/refresh').set('Origin', GAME).set('x-admin-client', 'portal').set('Cookie', 'il_admin_rt=stolen');
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ errorCode: 'ADMIN_ORIGIN_REFUSED' });
    expect(response.body).not.toHaveProperty('reached');
  });

  it('accepts the portal’s origin', async () => {
    const http = await appWith(policy());
    const response = await http.post('/api/v1/admin/auth/refresh').set('Origin', ADMIN);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reached: 'admin refresh' });
  });

  it('refuses a POST without an Origin in production, and allows it locally (curl, scripts)', async () => {
    const production = await appWith(policy());
    const refused = await production.post('/api/v1/admin/auth/refresh');
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ errorCode: 'ADMIN_ORIGIN_REQUIRED' });
    await app?.close();

    const local = await appWith(policy({ requireAdminOrigin: false }));
    expect((await local.post('/api/v1/admin/auth/refresh')).status).toBe(200);
    // A wrong Origin is refused locally too.
    expect((await local.post('/api/v1/admin/auth/refresh').set('Origin', GAME)).status).toBe(403);
  });

  it('leaves safe reads (they need an admin access token) and the game’s routes alone', async () => {
    const http = await appWith(policy());
    expect((await http.get('/api/v1/admin/auth/me')).status).toBe(200);
    expect((await http.post('/api/v1/players/me/actions').set('Origin', GAME)).status).toBe(200);
    expect((await http.post('/api/v1/players/me/actions')).status).toBe(200);
  });

  it('with ADMIN_API_HOST set, serves the admin API on that host only', async () => {
    const http = await appWith(policy({ adminApiHost: 'admin-api.insidelife.online' }));
    expect((await http.get('/api/v1/admin/auth/me').set('Host', 'insidelife.online')).status).toBe(404);
    expect((await http.post('/api/v1/admin/auth/refresh').set('Host', 'insidelife.online').set('Origin', ADMIN)).status).toBe(404);
    expect((await http.get('/api/v1/admin/auth/me').set('Host', 'admin-api.insidelife.online')).status).toBe(200);
    expect((await http.post('/api/v1/admin/auth/refresh').set('Host', 'admin-api.insidelife.online:443').set('Origin', ADMIN)).status).toBe(200);
    // The game's routes don't care.
    expect((await http.post('/api/v1/players/me/actions').set('Host', 'insidelife.online')).status).toBe(200);
  });
});

describe('adminRequestRefusal', () => {
  it('recognises admin paths in any API version, and nothing else', () => {
    expect(isAdminPath('/api/v1/admin')).toBe(true);
    expect(isAdminPath('/api/v2/admin/players?q=x')).toBe(true);
    expect(isAdminPath('/api/v1/administrators')).toBe(false);
    expect(isAdminPath('/api/v1/players/admin')).toBe(false);
  });

  it('checks every state-changing method', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(adminRequestRefusal({ method, path: '/api/v1/admin/ad-rates/x', origin: GAME, host: 'insidelife.online' }, policy())?.status).toBe(403);
      expect(adminRequestRefusal({ method, path: '/api/v1/admin/ad-rates/x', origin: `${ADMIN}/`, host: 'insidelife.online' }, policy())).toBeNull();
    }
  });
});
