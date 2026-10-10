import { Inject, Injectable } from '@nestjs/common';
import { JOBS } from '@insidelife/shared';
import { CREDENTIALS_PORT, type CredentialsPort, type CredentialsSnapshot } from '../../common/ports/credentials.port.js';
import { INVENTORY_PORT, type InventoryPort } from '../../common/ports/inventory.port.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { TimelinePlanner } from '../simulation/timeline-planner.service.js';
import { CareerStore } from './career.store.js';
import { jobItemTags, type CandidateProfile } from './rules/requirements.js';

const CREDENTIALS_MEMO = 'careers:credentials';
const JOB_ITEM_TAGS = jobItemTags(JOBS);

/**
 * Gathers what employers look at: age, skills, connections, credentials (education port), owned items (inventory
 * port plus every system's item tags, e.g. a car from the vehicles domain) and work experience.
 */
@Injectable()
export class CandidateProfileService {
  constructor(
    @Inject(CREDENTIALS_PORT) private readonly credentialsPort: CredentialsPort,
    @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort,
    private readonly planner: TimelinePlanner,
    private readonly store: CareerStore,
  ) {}

  credentials(ctx: SimulationContext): Promise<CredentialsSnapshot> {
    return ctx.memo(CREDENTIALS_MEMO, () => this.credentialsPort.credentials(ctx));
  }

  /** Drop cached credentials after granting a licence. */
  forgetCredentials(ctx: SimulationContext): void {
    ctx.invalidate(CREDENTIALS_MEMO);
  }

  async build(ctx: SimulationContext): Promise<CandidateProfile> {
    // One at a time: these share the session's transaction connection (pg runs one query at a time).
    const credentials = await this.credentials(ctx);
    const itemTags = await this.itemTags(ctx);
    const experienceYears = await this.store.experienceYears(ctx);
    return {
      age: ctx.age,
      skills: ctx.character.skills,
      connections: ctx.character.connections,
      credentials,
      itemTags,
      experienceYears,
    };
  }

  private async itemTags(ctx: SimulationContext): Promise<ReadonlySet<string>> {
    const systemTags = new Set(await this.planner.itemTags(ctx));
    const owned = new Set<string>();
    for (const tag of JOB_ITEM_TAGS) {
      if (systemTags.has(tag) || (await this.inventory.hasTag(ctx, tag))) owned.add(tag);
    }
    return owned;
  }
}
