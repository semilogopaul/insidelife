import { Inject, Injectable, Logger } from '@nestjs/common';
import { dayIndexOf } from '@insidelife/shared';
import { DomainException } from '../../../common/exceptions/domain.exception.js';
import { CREDENTIALS_PORT, type CredentialsPort, type CredentialsSnapshot } from '../../../common/ports/credentials.port.js';
import { EMPLOYMENT_PORT, type EmploymentPort, type EmploymentSnapshot } from '../../../common/ports/employment.port.js';
import { FAMILY_PORT, type FamilyPort, type FamilySnapshot } from '../../../common/ports/family.port.js';
import { HEALTH_PORT, type HealthPort } from '../../../common/ports/health.port.js';
import { HOUSEHOLD_PORT, type HomeSnapshot, type HouseholdPort } from '../../../common/ports/household.port.js';
import { INVENTORY_PORT, type InventoryPort, type PowerBackup } from '../../../common/ports/inventory.port.js';
import { LedgerService } from '../../ledger/ledger.service.js';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import { TimelinePlanner } from '../../simulation/timeline-planner.service.js';
import { TRACKED_ILLNESSES, type CharacterFacts, type FactSource, type ProgressionFacts } from '../progression.rules.js';
import { CountersService } from './counters.service.js';

type MutableFacts = { -readonly [K in keyof ProgressionFacts]: ProgressionFacts[K] };

/**
 * Gathers the facts conditions need, asking each domain port at most once per game day per transaction
 * (`ctx.memo` keyed by source and day). Only the sources a candidate condition actually reads are gathered.
 */
@Injectable()
export class FactsService {
  private readonly logger = new Logger(FactsService.name);

  constructor(
    @Inject(CREDENTIALS_PORT) private readonly credentialsPort: CredentialsPort,
    @Inject(EMPLOYMENT_PORT) private readonly employmentPort: EmploymentPort,
    @Inject(INVENTORY_PORT) private readonly inventoryPort: InventoryPort,
    @Inject(HOUSEHOLD_PORT) private readonly householdPort: HouseholdPort,
    @Inject(FAMILY_PORT) private readonly familyPort: FamilyPort,
    @Inject(HEALTH_PORT) private readonly healthPort: HealthPort,
    private readonly planner: TimelinePlanner,
    private readonly ledger: LedgerService,
    private readonly counters: CountersService,
  ) {}

  async gather(ctx: SimulationContext, sources: Iterable<FactSource>): Promise<ProgressionFacts> {
    const wanted = new Set(sources);
    const facts: MutableFacts = { counters: await this.counters.load(ctx), character: this.character(ctx) };
    if (wanted.has('credentials')) facts.credentials = await this.credentials(ctx);
    if (wanted.has('employment')) facts.employment = await this.employment(ctx);
    if (wanted.has('tags')) facts.tags = await this.tags(ctx);
    if (wanted.has('home')) facts.home = await this.home(ctx);
    if (wanted.has('property')) facts.propertyValue = await this.propertyValue(ctx);
    if (wanted.has('family')) facts.family = await this.family(ctx);
    if (wanted.has('savings')) facts.savings = await this.savings(ctx);
    if (wanted.has('power')) facts.power = await this.power(ctx);
    if (wanted.has('health')) facts.illnesses = await this.illnesses(ctx);
    return facts;
  }

  character(ctx: SimulationContext): CharacterFacts {
    const character = ctx.character;
    return {
      status: character.status,
      background: character.background,
      age: ctx.age,
      generation: character.generation,
      skills: character.skills,
      fitness: character.fitness,
      lifestyle: character.lifestyle,
      earnedTotal: character.earnedTotal,
    };
  }

  credentials(ctx: SimulationContext): Promise<CredentialsSnapshot | undefined> {
    return this.daily(ctx, 'credentials', () => this.credentialsPort.credentials(ctx));
  }

  /** `undefined` = unknown (port failed), `null` = unemployed. */
  employment(ctx: SimulationContext): Promise<EmploymentSnapshot | null | undefined> {
    return this.daily(ctx, 'employment', () => this.employmentPort.current(ctx));
  }

  async tags(ctx: SimulationContext): Promise<ReadonlySet<string> | undefined> {
    // The planner aggregates every system's item tags (shop items, vehicles, businesses) and memoises them itself.
    return this.daily(ctx, 'tags', async () => new Set(await this.planner.itemTags(ctx)));
  }

  home(ctx: SimulationContext): Promise<HomeSnapshot | undefined> {
    return this.daily(ctx, 'home', () => this.householdPort.home(ctx));
  }

  propertyValue(ctx: SimulationContext): Promise<number | undefined> {
    return this.daily(ctx, 'property', () => this.householdPort.propertyValue(ctx));
  }

  family(ctx: SimulationContext): Promise<FamilySnapshot | undefined> {
    return this.daily(ctx, 'family', () => this.familyPort.snapshot(ctx));
  }

  savings(ctx: SimulationContext): Promise<number | undefined> {
    return this.daily(ctx, 'savings', async () => (await this.ledger.balances(ctx.manager, ctx.character.id)).savings);
  }

  power(ctx: SimulationContext): Promise<PowerBackup | undefined> {
    return this.daily(ctx, 'power', async () => (await this.inventoryPort.homeComfortBonus(ctx)).power);
  }

  /** Tracked illnesses the character has right now (only the ones achievements care about). */
  illnesses(ctx: SimulationContext): Promise<ReadonlySet<string> | undefined> {
    return this.daily(ctx, 'health', async () => {
      const current = new Set<string>();
      for (const illness of TRACKED_ILLNESSES) if (await this.healthPort.hasCondition(ctx, illness)) current.add(illness);
      return current;
    });
  }

  /**
   * Memoise a port read for the current game day. A domain rule failure (DomainException) degrades to "unknown"
   * instead of breaking the player's settle; anything else is a real bug and propagates.
   */
  private daily<T>(ctx: SimulationContext, source: FactSource, loader: () => Promise<T>): Promise<T | undefined> {
    return ctx.memo(`progression:fact:${source}:${dayIndexOf(ctx.time)}`, async () => {
      try {
        return await loader();
      } catch (error) {
        if (!(error instanceof DomainException)) throw error;
        this.logger.warn({ characterId: ctx.character.id, source, errorCode: error.errorCode }, 'Progression fact unavailable');
        return undefined;
      }
    });
  }
}
