import { Injectable } from '@nestjs/common';
import { MAX_HOME_COMFORT, districtComfortBonus, type HomeComfortDto } from '@insidelife/shared';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { HomeService } from './home.service.js';
import { PowerService } from './power.service.js';

export interface ComfortBreakdown extends HomeComfortDto {
  /** Comfort bonus before blackouts (type + area + furniture, capped). */
  readonly bonus: number;
  readonly bedQuality: number;
}

/** How much the home adds to the comfort equilibrium: type + area + furniture − NEPA. */
@Injectable()
export class ComfortService {
  constructor(
    private readonly homes: HomeService,
    private readonly power: PowerService,
  ) {}

  async breakdown(ctx: SimulationContext): Promise<ComfortBreakdown> {
    const home = await this.homes.current(ctx);
    const amenities = await this.power.amenities(ctx);
    const power = await this.power.status(ctx);
    const area = districtComfortBonus(home.districtId);
    const furniture = Math.max(0, amenities.comfort);
    const bonus = Math.min(MAX_HOME_COMFORT, Math.max(0, home.typeComfort + area + furniture));
    return {
      home: home.typeComfort,
      area,
      furniture,
      power: -power.comfortPenalty,
      bonus,
      total: Math.round((bonus - power.comfortPenalty) * 10) / 10,
      bedQuality: amenities.bedQuality,
    };
  }
}
