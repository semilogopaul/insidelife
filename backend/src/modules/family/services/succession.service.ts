import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import type { EntityManager, Repository } from 'typeorm';
import {
  FUNERALS,
  MINUTES_PER_DAY,
  MINUTES_PER_YEAR,
  STATES_OF_ORIGIN,
  ethnicityOfState,
  formatNaira,
  generateName,
  homeLocationId,
  yearsBetween,
  type EstateDto,
  type Rng,
  type SuccessionDto,
  cityOfDistrict,
} from '@insidelife/shared';
import { HOUSEHOLD_PORT, type HouseholdPort } from '../../../common/ports/household.port.js';
import { CharacterEntity } from '../../characters/entities/character.entity.js';
import type { CharacterAccounts } from '../../ledger/interfaces/ledger.interfaces.js';
import { LedgerService } from '../../ledger/ledger.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { CharacterWallet, SimulationContext } from '../../simulation/simulation-context.js';
import { SimulationRegistry } from '../../simulation/simulation-registry.service.js';
import type { PersonEntity } from '../entities/person.entity.js';
import { SuccessionEntity } from '../entities/succession.entity.js';
import { fullName, relationshipsOfKind, type FamilyGraph } from '../interfaces/family-graph.js';
import { funeralTierFor, settleEstate } from '../rules/estate.rules.js';
import { HEIR_AGE, heirAppearance, heirSeed, heirSkills } from '../rules/heir.rules.js';
import { ChildrenService, type ChildEntry } from './children.service.js';
import { PlayerLinksService } from './player-links.service.js';
import { PlayerNotifier } from './player-notifier.service.js';
import { RelationshipsService } from './relationships.service.js';

const GRIEF_DAYS = 30;

/** Tables holding a character's belongings, by the simulation system that values them (net worth). */
const BELONGINGS: ReadonlyArray<{ readonly system: string; readonly tables: readonly string[] }> = [
  { system: 'shop', tables: ['inventory_items'] },
  { system: 'vehicles', tables: ['owned_vehicles'] },
  { system: 'investments', tables: ['investment_holdings', 'investment_deposits', 'investment_savings_accruals', 'investment_ponzi_stakes'] },
];

/**
 * Death and the dynasty. When a character dies, the eldest living child continues as the next generation (aged up to
 * 17 if younger — raised by an aunty until then), the estate is settled (funeral, 5% probate) and inherited, and a
 * player spouse is widowed. No children: the line ends and the player starts a new life.
 */
@Injectable()
export class SuccessionService {
  private readonly logger = new Logger(SuccessionService.name);

  constructor(
    @InjectRepository(SuccessionEntity) private readonly successions: Repository<SuccessionEntity>,
    @Inject(HOUSEHOLD_PORT) private readonly household: HouseholdPort,
    private readonly ledger: LedgerService,
    private readonly registry: SimulationRegistry,
    private readonly notifications: NotificationsService,
    private readonly notifier: PlayerNotifier,
    private readonly relationships: RelationshipsService,
    private readonly children: ChildrenService,
    private readonly links: PlayerLinksService,
  ) {}

  async succeed(ctx: SimulationContext): Promise<void> {
    const deceased = ctx.character;
    const manager = ctx.manager;
    if (await manager.exists(SuccessionEntity, { where: { deceasedCharacterId: deceased.id } })) return;

    // The one-living-character-per-user index must see this row as dead before the heir row exists.
    deceased.alive = false;
    deceased.diedAt ??= ctx.time;
    deceased.activity = null;
    deceased.travel = null;
    await manager.save(CharacterEntity, deceased);

    await this.links.onDeath(ctx);
    const graph = await this.relationships.graph(ctx);
    const estate = await this.settle(ctx);
    const pick = this.children.heirCandidate(graph);

    let heir: CharacterEntity | null = null;
    let agedUp = false;
    if (pick) {
      ({ heir, agedUp } = await this.createHeir(ctx, graph, pick, estate));
    } else {
      const left = await this.ledger.balances(manager, deceased.id);
      await ctx.wallet.pay(left.cash, 'inheritance', 'Estate shared among the extended family', 'estate:extended-family');
      await ctx.wallet.pay(left.savings, 'inheritance', 'Estate shared among the extended family', 'estate:extended-family-savings', { account: 'savings' });
    }

    await manager.save(
      SuccessionEntity,
      manager.create(SuccessionEntity, {
        userId: deceased.userId,
        dynastyId: deceased.dynastyId,
        deceasedCharacterId: deceased.id,
        deceasedName: fullName(deceased),
        generation: deceased.generation,
        diedAt: deceased.diedAt ?? ctx.time,
        causeOfDeath: deceased.causeOfDeath,
        heirCharacterId: heir?.id ?? null,
        heirPersonId: pick?.person.id ?? null,
        heirName: heir ? fullName(heir) : null,
        agedUp,
        gross: estate.gross,
        funeral: estate.funeral,
        funeralTier: estate.funeralTier,
        probate: estate.probate,
        inherited: heir ? estate.inherited : 0,
        createdAtGame: ctx.time,
      }),
    );

    ctx.notify({
      kind: 'family',
      title: `Rest in peace, ${deceased.firstName}`,
      body: heir
        ? `${fullName(heir)} carries on the ${deceased.lastName} name with ${formatNaira(estate.inherited)}.`
        : 'There was no child to carry on the line. Your story ends here — start a new life.',
      tone: 'neutral',
    });
    this.notifier.invalidate(ctx, deceased.id, 'succession');
  }

  async history(userId: string): Promise<SuccessionDto[]> {
    const rows = await this.successions.find({ where: { userId }, order: { createdAtGame: 'DESC' }, take: 50 });
    return rows.map((row) => ({
      id: row.id,
      generation: row.generation,
      deceased: { characterId: row.deceasedCharacterId, name: row.deceasedName, diedAt: row.diedAt, causeOfDeath: row.causeOfDeath },
      heir: row.heirCharacterId && row.heirName ? { characterId: row.heirCharacterId, name: row.heirName, agedUp: row.agedUp } : null,
      estate: { gross: row.gross, funeral: row.funeral, funeralTier: row.funeralTier, probate: row.probate, inherited: row.inherited },
      createdAt: row.createdAtGame,
    }));
  }

  /** Funeral and probate come out of the estate (cash first, then savings); the rest stays put for the heir. */
  private async settle(ctx: SimulationContext): Promise<EstateDto> {
    const deceased = ctx.character;
    const balances = await this.ledger.balances(ctx.manager, deceased.id);
    // Other systems may have moved money with the ledger directly during onDeath: start from the real balance.
    ctx.wallet.sync(new Map([[ctx.wallet.accounts.cash, balances.cash]]));
    const priceIndex = ctx.world.economy(ctx.time).priceIndex;
    const funeralTier = funeralTierFor(deceased.status, balances.cash + balances.savings, priceIndex);
    const settlement = settleEstate({ cash: balances.cash, savings: balances.savings, funeralCost: Math.round(FUNERALS[funeralTier].cost * priceIndex) });
    const fromSavings = Math.max(0, settlement.funeral + settlement.probate - balances.cash);
    if (fromSavings > 0) await ctx.wallet.move('savings', 'cash', fromSavings, 'adjustment', 'Estate: savings released for the funeral', 'estate:savings');
    await ctx.wallet.pay(settlement.funeral, 'ceremony', `${FUNERALS[funeralTier].label} for ${fullName(deceased)}`, 'estate:funeral');
    await ctx.wallet.pay(settlement.probate, 'fee', 'Probate and court fees', 'estate:probate', { sink: 'fees' });
    return { ...settlement, funeralTier };
  }

  private async createHeir(
    ctx: SimulationContext,
    graph: FamilyGraph,
    pick: ChildEntry,
    estate: EstateDto,
  ): Promise<{ readonly heir: CharacterEntity; readonly agedUp: boolean }> {
    const deceased = ctx.character;
    const manager = ctx.manager;
    const person = pick.person;
    const rng = ctx.rng('heir', person.id);
    const agedUp = yearsBetween(person.bornAt, ctx.time) < HEIR_AGE;
    if (agedUp) person.bornAt = ctx.time - HEIR_AGE * MINUTES_PER_YEAR - rng.int(0, 29) * MINUTES_PER_DAY;
    const aunty = generateName(rng, person.ethnicity, 'female').firstName;

    const id = randomUUID();
    const skills = heirSkills(rng, deceased.background, person.schoolPerformance);
    const draft = manager.create(CharacterEntity, {
      id,
      userId: deceased.userId,
      handle: await this.heirHandle(manager, deceased, rng),
      firstName: person.firstName,
      lastName: person.lastName,
      gender: person.gender,
      stateOfOrigin: this.stateFor(deceased.stateOfOrigin, person),
      background: deceased.background,
      appearance: heirAppearance(rng, deceased.appearance, person.gender),
      outfit: {},
      bornAt: person.bornAt,
      alive: true,
      diedAt: null,
      causeOfDeath: null,
      generation: deceased.generation + 1,
      dynastyId: deceased.dynastyId,
      predecessorId: deceased.id,
      lifestyle: 'managing',
      defaultTransport: 'danfo',
      needs: { energy: 75, hunger: 70, hygiene: 75, fun: 45, social: 50 },
      health: rng.int(78, 92),
      fitness: skills.fitness,
      skills,
      moodModifiers: [{ id: `grief:${deceased.id}`, label: `Mourning ${deceased.firstName}`, value: -20, until: ctx.time + GRIEF_DAYS * MINUTES_PER_DAY }],
      status: Math.round(deceased.status * 0.2),
      connections: Math.max(5, Math.round(deceased.connections * 0.3)),
      locationId: homeLocationId(id),
      cityId: cityOfDistrict(deceased.homeDistrictId),
      homeDistrictId: deceased.homeDistrictId,
      homePropertyId: deceased.homePropertyId,
      activity: null,
      travel: null,
      settledAt: ctx.time,
      lastSleptAt: ctx.time,
      seed: heirSeed(rng),
      earnedTotal: 0,
      unearnedTotal: estate.inherited,
      // The parent's starting money stays unsendable in the heir's hands too.
      lockedUnearned: Math.min(estate.inherited, Number(deceased.lockedUnearned)),
      purchasedTotal: 0,
      netWorth: estate.inherited,
      lastActiveAt: new Date(),
    });
    await manager.insert(CharacterEntity, { ...draft });
    // Reload so column transformers apply (insert() merges raw driver strings back, e.g. bigint totals).
    const heir = await manager.findOneByOrFail(CharacterEntity, { id });

    person.characterId = id;
    person.guardianCharacterId = null;
    person.schoolTier = 'none';
    person.sentHomeTerm = null;
    await this.relationships.savePeople(ctx, person);

    const accounts = await this.ledger.openCharacterAccounts(manager, id);
    const inherited = await this.transferAccounts(ctx, accounts, id);
    const heirCtx = new SimulationContext(heir, manager, ctx.world, ctx.time);
    heirCtx.bindWallet(new CharacterWallet(heirCtx, this.ledger, accounts, inherited.cash));
    heirCtx.wallet.recordUnearnedAsset(inherited.otherValue);
    await this.wireFamily(ctx, heirCtx, graph, pick);
    await this.reassignWards(ctx, graph, pick, id);
    await this.bequeathBelongings(ctx, heirCtx);
    // Domains set up their starting state for the new generation (WAEC result, home, starter kit…). Each runs in a
    // savepoint: one domain's failure must never block a death from settling (the player would be stuck forever).
    for (const system of this.registry.all) {
      if (!system.onCharacterCreated) continue;
      try {
        await manager.transaction(() => system.onCharacterCreated?.(heirCtx) ?? Promise.resolve());
      } catch (error) {
        this.logger.error({ err: error, system: system.key }, 'Heir setup failed for a domain; continuing without it');
      }
    }

    const parentTitle = deceased.gender === 'male' ? 'Daddy' : 'Mummy';
    heirCtx.notify({
      kind: 'family',
      title: `You are ${fullName(heir)}`,
      body:
        (agedUp ? `Raised by Aunty ${aunty} after ${parentTitle}’s passing, you’re 17 now and ready to carry the family name. ` : '') +
        `${parentTitle} left you ${formatNaira(estate.inherited)} after a ${FUNERALS[estate.funeralTier].label.toLowerCase()} (${formatNaira(estate.funeral)}) and probate (${formatNaira(estate.probate)}).`,
      tone: 'neutral',
      amount: estate.inherited,
    });
    await manager.save(CharacterEntity, heir);
    await this.notifications.create(manager, id, heirCtx.notifications);
    for (const hook of heirCtx.pendingAfterCommit) ctx.afterCommit(hook);
    return { heir, agedUp };
  }

  /**
   * Move every remaining balance to the heir account by account: cash, savings and pension in one naira posting, the
   * dollar account in its own USD-balanced posting. Returns the heir's cash and the naira value of the rest.
   */
  private async transferAccounts(ctx: SimulationContext, heirAccounts: CharacterAccounts, heirId: string): Promise<{ readonly cash: number; readonly otherValue: number }> {
    const deceased = ctx.character;
    const from = ctx.wallet.accounts;
    const left = await this.ledger.balances(ctx.manager, deceased.id);
    const memo = `Inheritance from ${fullName(deceased)}`;
    const base = { kind: 'inheritance' as const, memo, gameMinute: ctx.time, characterId: heirId, counterpartyCharacterId: deceased.id };
    const naira = (['cash', 'savings', 'pension'] as const).filter((kind) => left[kind] > 0);
    if (naira.length > 0) {
      const posting = await this.ledger.post(ctx.manager, {
        ...base,
        idempotencyKey: `${deceased.id}:estate:inheritance`,
        legs: naira.flatMap((kind) => [
          { accountId: from[kind], amount: -left[kind] },
          { accountId: heirAccounts[kind], amount: left[kind] },
        ]),
      });
      ctx.wallet.sync(posting.balances);
    }
    if (left.usd > 0) {
      await this.ledger.post(ctx.manager, {
        ...base,
        idempotencyKey: `${deceased.id}:estate:inheritance-usd`,
        legs: [
          { accountId: from.usd, amount: -left.usd },
          { accountId: heirAccounts.usd, amount: left.usd },
        ],
      });
    }
    const usdValue = Math.round((left.usd / 100) * ctx.world.economy(ctx.time).usdRate);
    return { cash: left.cash, otherValue: left.pension + usdValue };
  }

  /**
   * Belongings pass to the heir: land and buildings (housing, via HOUSEHOLD_PORT), clothes and gadgets, vehicles and
   * investment positions. Their value counts as unearned for the heir. Each domain moves in its own savepoint so one
   * that isn't deployed never blocks the succession.
   */
  private async bequeathBelongings(ctx: SimulationContext, heirCtx: SimulationContext): Promise<void> {
    const heirId = heirCtx.character.id;
    const steps: ReadonlyArray<{ readonly label: string; readonly run: () => Promise<number> }> = [
      { label: 'housing', run: () => this.household.transferEstate(ctx, heirId) },
      ...BELONGINGS.map(({ system, tables }) => ({
        label: system,
        run: async () => {
          const worth = (await this.registry.all.find((candidate) => candidate.key === system)?.netWorth?.(ctx)) ?? 0;
          for (const table of tables) await ctx.manager.query(`UPDATE ${table} SET character_id = $1 WHERE character_id = $2`, [heirId, ctx.character.id]);
          return worth;
        },
      })),
    ];
    for (const step of steps) {
      try {
        const worth = await ctx.manager.transaction(() => step.run());
        heirCtx.wallet.recordUnearnedAsset(worth);
      } catch (error) {
        this.logger.warn({ err: error, domain: step.label }, 'Could not pass belongings to the heir');
      }
    }
  }

  /** The heir's family: the late parent, the other parent, siblings and grandparents. */
  private async wireFamily(ctx: SimulationContext, heirCtx: SimulationContext, graph: FamilyGraph, pick: ChildEntry): Promise<void> {
    const deceased = ctx.character;
    const person = pick.person;
    const rng = heirCtx.rng('heir-family');
    await this.relationships.create(heirCtx, {
      otherCharacterId: deceased.id,
      kind: deceased.gender === 'male' ? 'father' : 'mother',
      closeness: this.relationships.closeness(pick.rel, ctx.time),
      metAt: 'family',
      since: person.bornAt,
    });
    for (const parentId of person.parentPersonIds) {
      const parent = graph.people.get(parentId);
      if (!parent) continue;
      await this.relationships.create(heirCtx, { personId: parent.id, kind: parent.gender === 'male' ? 'father' : 'mother', closeness: 70, metAt: 'family', since: person.bornAt });
    }
    for (const parentId of person.parentCharacterIds) {
      const parent = graph.players.get(parentId);
      if (!parent || parent.id === deceased.id) continue;
      await this.relationships.create(heirCtx, { otherCharacterId: parent.id, kind: parent.gender === 'male' ? 'father' : 'mother', closeness: 65, metAt: 'family', since: person.bornAt });
    }
    for (const sibling of this.children.children(graph)) {
      if (sibling.person.id === person.id) continue;
      await this.relationships.create(heirCtx, { personId: sibling.person.id, kind: 'sibling', closeness: rng.int(45, 75), metAt: 'family', since: Math.max(person.bornAt, sibling.person.bornAt) });
    }
    for (const grandparent of relationshipsOfKind(graph, 'father', 'mother')) {
      if (!grandparent.personId) continue;
      await this.relationships.create(heirCtx, { personId: grandparent.personId, kind: 'grandparent', closeness: 50, metAt: 'family', since: person.bornAt });
    }
  }

  /** Younger siblings go to the other living player parent, else the heir becomes their guardian (eldest takes charge). */
  private async reassignWards(ctx: SimulationContext, graph: FamilyGraph, pick: ChildEntry, heirId: string): Promise<void> {
    const deceased = ctx.character;
    const moved: PersonEntity[] = [];
    for (const { person } of this.children.children(graph)) {
      if (person.id === pick.person.id || !person.alive || person.characterId || person.guardianCharacterId !== deceased.id) continue;
      const otherParent = person.parentCharacterIds.map((id) => graph.players.get(id)).find((player) => player && player.id !== deceased.id && player.alive);
      person.guardianCharacterId = otherParent?.id ?? heirId;
      moved.push(person);
    }
    await this.relationships.savePeople(ctx, ...moved);
  }

  private stateFor(parentState: string, person: PersonEntity): string {
    if (ethnicityOfState(parentState) === person.ethnicity) return parentState;
    return STATES_OF_ORIGIN.find((state) => state.ethnicity === person.ethnicity)?.id ?? parentState;
  }

  private async heirHandle(manager: EntityManager, deceased: CharacterEntity, rng: Rng): Promise<string> {
    const base = deceased.handle.replace(/_\d+$/, '') || 'heir';
    const generation = deceased.generation + 1;
    const suffixes = [`_${generation}`, `_${generation}${rng.int(10, 99)}`, `_${generation}${rng.int(100, 999)}`];
    for (const suffix of suffixes) {
      const handle = `${base.slice(0, 20 - suffix.length)}${suffix}`;
      if (!(await manager.exists(CharacterEntity, { where: { handle } }))) return handle;
    }
    return `heir_${rng.int(0, 0xfffffff).toString(16)}`.slice(0, 20);
  }
}

