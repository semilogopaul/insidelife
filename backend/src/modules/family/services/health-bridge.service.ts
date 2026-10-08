import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { HEALTH_PORT, type HealthPort } from '../../../common/ports/health.port.js';
import type { SimulationContext } from '../../simulation/simulation-context.js';

/**
 * Lazy access to the health module's port. HealthModule imports FamilyModule (to record births), so importing it
 * back would create a cycle; the port is resolved from the container at call time instead.
 */
@Injectable()
export class HealthBridge {
  private readonly logger = new Logger(HealthBridge.name);
  private cached: HealthPort | null = null;

  constructor(private readonly moduleRef: ModuleRef) {}

  /**
   * Start a pregnancy through the health module — for a woman her own, for a man his partner's (health tracks it and
   * calls `recordBirth` at delivery). Returns whether a pregnancy is now ongoing; null when health isn't available.
   */
  async conceive(ctx: SimulationContext, partnerName: string): Promise<boolean | null> {
    const port = this.port();
    if (!port) return null;
    await port.conceive(ctx, partnerName);
    return port.isPregnant(ctx);
  }

  async isPregnant(ctx: SimulationContext): Promise<boolean> {
    return (await this.port()?.isPregnant(ctx)) ?? false;
  }

  private port(): HealthPort | null {
    if (this.cached) return this.cached;
    try {
      this.cached = this.moduleRef.get<HealthPort>(HEALTH_PORT, { strict: false });
    } catch {
      this.logger.warn('HEALTH_PORT is not registered; the family domain tracks NPC partner pregnancies itself');
    }
    return this.cached;
  }
}
