import { BullModule } from '@nestjs/bullmq';
import type { ConnectionOptions } from 'bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { redisOptionsFromUrl } from './common/redis/redis-options.js';
import { RedisThrottlerStorage } from './common/redis/redis-throttler.storage.js';
import { REDIS, RedisModule } from './common/redis/redis.module.js';
import type { Redis } from 'ioredis';
import { resolveTraceId, TRACE_HEADER } from './common/utils/trace.js';
import { configuration, type AppConfig } from './config/configuration.js';
import { validationSchema } from './config/validation.schema.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { MetricsInterceptor } from './metrics/metrics.interceptor.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { LedgerModule } from './modules/ledger/ledger.module.js';
import { LifeModule } from './modules/life/life.module.js';
import { RealtimeBusModule } from './modules/realtime-bus/realtime-bus.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';
import { SettlementModule } from './modules/settlement/settlement.module.js';
import { WorldModule } from './modules/world/world.module.js';
import { DOMAIN_MODULES } from './modules/domain-modules.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validationSchema,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const env = config.get('env', { infer: true });
        return {
          pinoHttp: {
            level: config.get('logLevel', { infer: true }),
            genReqId: (req, res) => {
              const traceId = resolveTraceId(req);
              res.setHeader(TRACE_HEADER, traceId);
              return traceId;
            },
            // `ip` is the real client (CLIENT_IP_HEADER / TRUST_PROXY_HOPS), not the proxy's socket address.
            customProps: (req) => ({ traceId: req.id, clientIp: (req as { ip?: string }).ip }),
            redact: {
              paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', '*.password', '*.passwordHash'],
              censor: '[redacted]',
            },
            autoLogging: { ignore: (req) => req.url === '/api/health' || req.url === '/api/metrics' },
            transport: env === 'development' ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } } : undefined,
          },
        };
      },
    }),
    // Counters live in Redis so the limits hold across every API node.
    ThrottlerModule.forRootAsync({
      inject: [REDIS],
      useFactory: (redis: Redis) => ({ throttlers: [{ name: 'default', ttl: 60_000, limit: 240 }], storage: new RedisThrottlerStorage(redis) }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        connection: redisOptionsFromUrl(config.get('redis', { infer: true }).url, { maxRetriesPerRequest: null }) as ConnectionOptions,
        prefix: 'il',
      }),
    }),
    DatabaseModule,
    RedisModule,
    MetricsModule,
    HealthModule,
    RealtimeBusModule,
    LedgerModule,
    WorldModule,
    AuthModule,
    LifeModule,
    RealtimeModule,
    SettlementModule,
    ...DOMAIN_MODULES,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class AppModule {}
