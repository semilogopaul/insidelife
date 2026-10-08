import { Injectable, Logger } from '@nestjs/common';
import type { SimulationSystem } from './interfaces/simulation-system.interface.js';

/**
 * Domain modules register their simulation systems here during `onModuleInit`. Keeps the dependency arrow pointing
 * one way: domains depend on the simulation module, never the reverse.
 */
@Injectable()
export class SimulationRegistry {
  private readonly logger = new Logger(SimulationRegistry.name);
  private systems: readonly SimulationSystem[] = [];

  register(system: SimulationSystem): void {
    if (this.systems.some((existing) => existing.key === system.key)) {
      throw new RangeError(`Simulation system "${system.key}" registered twice`);
    }
    this.systems = [...this.systems, system].toSorted((a, b) => a.order - b.order);
    this.logger.debug(`Registered simulation system ${system.key} (order ${system.order})`);
  }

  get all(): readonly SimulationSystem[] {
    return this.systems;
  }
}
