import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomBytes, randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import {
  BACKGROUNDS,
  BACKGROUND_IDS,
  MINUTES_PER_YEAR,
  SKILL_KEYS,
  STARTER_FUND,
  createRng,
  formatNaira,
  homeLocationId,
  type BackgroundId,
  type DistrictId,
  type SkillKey,
  type Skills,
} from '@insidelife/shared';
import { ConflictException } from '../../common/exceptions/domain.exception.js';
import { withTransaction } from '../../database/transaction.js';
import { CharacterEntity } from '../characters/entities/character.entity.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CharacterWallet, SimulationContext } from '../simulation/simulation-context.js';
import { SimulationRegistry } from '../simulation/simulation-registry.service.js';
import { WorldService } from '../world/world.service.js';
import type { CreateCharacterDto } from './dto/create-character.dto.js';

/** Characters are born 18 years before they first appear: an adult, fresh out of SS3 with WAEC done. */
const STARTING_AGE_YEARS = 18;

export interface CreatedCharacter {
  readonly characterId: string;
  readonly background: BackgroundId;
}

/**
 * Character creation with the birth lottery. The player chooses name and looks; fate chooses the family.
 * Domain systems seed their own starting state (family members, WAEC result, home, starter items) through
 * `onCharacterCreated` inside the same transaction.
 */
@Injectable()
export class CharacterCreationService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly world: WorldService,
    private readonly ledger: LedgerService,
    private readonly registry: SimulationRegistry,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateCharacterDto): Promise<CreatedCharacter> {
    return withTransaction(this.dataSource, async (manager) => {
      const repo = manager.getRepository(CharacterEntity);
      if (await repo.exists({ where: { userId, alive: true } })) {
        throw new ConflictException('CHARACTER_EXISTS', 'You already have a character living their best life');
      }
      if (await repo.exists({ where: { handle: dto.handle.toLowerCase() } })) {
        throw new ConflictException('HANDLE_TAKEN', `@${dto.handle} is taken — try another handle`);
      }

      const seed = randomBytes(12).toString('hex');
      const rng = createRng(`${seed}:birth`);
      const background = rng.weighted(BACKGROUND_IDS.map((id) => ({ value: id, weight: BACKGROUNDS[id].weight })));
      const profile = BACKGROUNDS[background];
      const homeDistrictId = rng.pick(profile.homeDistrict) as DistrictId;
      const now = this.world.now();
      const id = randomUUID();

      const baseSkills = Object.fromEntries(SKILL_KEYS.map((key) => [key, rng.int(2, 8)])) as Record<SkillKey, number>;
      baseSkills.intellect = Math.round(profile.waecMean * 4 + rng.int(0, 10));
      baseSkills.hustle = background === 'sapa-pikin' ? rng.int(10, 18) : baseSkills.hustle;
      baseSkills.fitness = rng.int(20, 45);

      const character = repo.create({
        id,
        userId,
        handle: dto.handle.toLowerCase(),
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        gender: dto.gender,
        stateOfOrigin: dto.stateOfOrigin,
        background,
        appearance: { ...dto.appearance },
        outfit: {},
        bornAt: now - STARTING_AGE_YEARS * MINUTES_PER_YEAR - rng.int(0, MINUTES_PER_YEAR - 1),
        alive: true,
        diedAt: null,
        causeOfDeath: null,
        generation: 1,
        dynastyId: randomUUID(),
        predecessorId: null,
        lifestyle: profile.startingLifestyle,
        defaultTransport: 'danfo',
        needs: { energy: 80, hunger: 70, hygiene: 75, fun: 60, social: 55 },
        health: rng.int(78, 92),
        fitness: baseSkills.fitness,
        skills: baseSkills as Skills,
        moodModifiers: [],
        status: 0,
        connections: background === 'nepo-baby' ? 35 : background === 'ajebota' ? 15 : 5,
        locationId: homeLocationId(id),
        regionId: 'lagos',
        homeDistrictId,
        activity: null,
        travel: null,
        settledAt: now,
        lastSleptAt: now,
        seed,
        earnedTotal: 0,
        unearnedTotal: 0,
        lockedUnearned: profile.startingCash + STARTER_FUND,
        purchasedTotal: 0,
        netWorth: 0,
        lastActiveAt: new Date(),
      });
      await repo.insert({ ...character });
      // Reload so column transformers apply (insert() would merge raw driver strings back into the entity).
      const born = await repo.findOneByOrFail({ id });

      const accounts = await this.ledger.openCharacterAccounts(manager, id);
      const ctx = new SimulationContext(born, manager, this.world, now);
      ctx.bindWallet(new CharacterWallet(ctx, this.ledger, accounts, 0));

      await ctx.wallet.receive(profile.startingCash, 'opening-balance', `Starting money (${profile.label})`, 'opening-balance', {
        income: 'unearned',
      });
      await ctx.wallet.receive(STARTER_FUND, 'gift', 'Starter fund from Uncle Tunde in Houston', 'starter-fund', {
        income: 'unearned',
      });

      for (const system of this.registry.all) await system.onCharacterCreated?.(ctx);

      ctx.notify({
        kind: 'family',
        title: `Welcome to Lagos, ${born.firstName}!`,
        body: `Fate made you a ${profile.label} — ${profile.blurb} Uncle Tunde sent ${formatNaira(STARTER_FUND)} from Houston — “buy motor, no waste am.”`,
        tone: 'good',
        amount: STARTER_FUND,
      });

      born.netWorth = ctx.wallet.cash;
      await repo.save(born);
      await this.notifications.create(manager, id, ctx.notifications);
      return { characterId: id, background };
    });
  }
}
