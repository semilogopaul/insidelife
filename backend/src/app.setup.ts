import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { clientIpMiddleware } from './common/http/client-ip.js';
import { configureHttpBoundary } from './common/http/http-boundary.js';
import type { AppConfig } from './config/configuration.js';

/**
 * The HTTP pipeline every running API uses: proxies, security headers, cookies, the browser boundary (CORS and the
 * admin origin check), body limits, the `/api` prefix, URI versioning and validation. `main.ts` calls it before
 * listening; the end-to-end suite calls it on the in-process app, so tests run through exactly the same pipeline.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);

  // Proxies in front of the API (nginx = 1; an edge such as Caddy in front of nginx = 2), so rate limits see real IPs.
  app.set('trust proxy', config.get('trustProxyHops', { infer: true }));
  // Behind Cloudflare the hop count varies, so take the client IP from the edge's header when one is configured.
  const clientIpHeader = config.get('clientIpHeader', { infer: true });
  if (clientIpHeader) app.use(clientIpMiddleware(clientIpHeader));
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser());
  // CORS per route (the admin API admits only ADMIN_ORIGINS, the game's routes only CORS_ORIGINS), and admin API
  // requests that change something must carry an ADMIN_ORIGINS Origin (shuts out scripts on the game's origin).
  configureHttpBoundary(app, {
    gameOrigins: config.get('corsOrigins', { infer: true }),
    adminOrigins: config.get('adminOrigins', { infer: true }),
    requireAdminOrigin: config.get('env', { infer: true }) === 'production',
    adminApiHost: config.get('adminApiHost', { infer: true }),
  });
  app.useBodyParser('json', { limit: '64kb' });

  // Everything lives under /api (probes at /api/health and /api/metrics); nginx maps the public /health probe.
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableShutdownHooks();
}
