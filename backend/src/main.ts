import 'reflect-metadata';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { RedisIoAdapter } from './common/redis/redis-io.adapter.js';
import type { AppConfig } from './config/configuration.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, rawBody: true });
  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);
  app.useLogger(app.get(Logger));

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser());
  app.enableCors({ origin: [...config.get('corsOrigins', { infer: true })], credentials: true });
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

  const redisAdapter = new RedisIoAdapter(app, config.get('redis', { infer: true }).url, config.get('corsOrigins', { infer: true }));
  await redisAdapter.connect();
  app.useWebSocketAdapter(redisAdapter);

  await app.listen(config.get('port', { infer: true }), '0.0.0.0');
}

await bootstrap();
