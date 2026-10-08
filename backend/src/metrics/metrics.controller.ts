import { Controller, Get, Header, VERSION_NEUTRAL } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator.js';
import { MetricsService } from './metrics.service.js';

@Controller({ path: 'metrics', version: VERSION_NEUTRAL })
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Public()
  @Get()
  @Header('Cache-Control', 'no-store')
  async scrape(): Promise<string> {
    return this.metrics.registry.metrics();
  }
}
