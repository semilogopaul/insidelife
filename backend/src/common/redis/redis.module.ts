import { Global, Inject, Injectable, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { AppConfig } from '../../config/configuration.js';

export const REDIS = Symbol('REDIS');

@Injectable()
class RedisLifecycle implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}

/** One shared ioredis connection for caching, rate limits and presence. */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>): Redis => {
        const logger = new Logger('Redis');
        const client = new Redis(config.get('redis', { infer: true }).url, {
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: false,
        });
        client.on('error', (error: Error) => logger.warn(`Redis error: ${error.message}`));
        return client;
      },
    },
    RedisLifecycle,
  ],
  exports: [REDIS],
})
export class RedisModule {}
