import { Injectable } from '@nestjs/common';
import type { Entrance } from '@insidelife/shared';
import type { HomeAccessPort } from '../../common/ports/home-access.port.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { VisitsService } from './visits.service.js';

/** HOME_ACCESS_PORT for the movement layer: invited guests may walk into (and ride to) the host's home. */
@Injectable()
export class HomeAccessAdapter implements HomeAccessPort {
  constructor(private readonly visits: VisitsService) {}

  invitedDoor(ctx: SimulationContext, hostId: string): Promise<Entrance | null> {
    return this.visits.invitedDoor(ctx, hostId);
  }

  doorOf(ctx: SimulationContext, hostId: string): Promise<Entrance | null> {
    return this.visits.doorOf(ctx, hostId);
  }
}
