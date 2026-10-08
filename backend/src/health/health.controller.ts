import { Controller, Get, Inject, VERSION_NEUTRAL } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator, type HealthCheckResult, type HealthIndicatorResult } from '@nestjs/terminus';
import type { Redis } from 'ioredis';
import { Public } from '../common/decorators/public.decorator.js';
import { REDIS } from '../common/redis/redis.module.js';

@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: TypeOrmHealthIndicator,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.database.pingCheck('database', { timeout: 1_500 }),
      async (): Promise<HealthIndicatorResult> => {
        const pong = await this.redis.ping();
        return { redis: { status: pong === 'PONG' ? 'up' : 'down' } };
      },
    ]);
  }
}
