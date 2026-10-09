import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { RedisIoAdapter } from './common/redis/redis-io.adapter.js';
import type { AppConfig } from './config/configuration.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, rawBody: true });
  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);
  app.useLogger(app.get(Logger));
  configureApp(app);

  const redisAdapter = new RedisIoAdapter(app, config.get('redis', { infer: true }).url, config.get('corsOrigins', { infer: true }));
  await redisAdapter.connect();
  app.useWebSocketAdapter(redisAdapter);

  await app.listen(config.get('port', { infer: true }), '0.0.0.0');
}

await bootstrap();
