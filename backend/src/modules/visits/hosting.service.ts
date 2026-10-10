import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  HOST_TREATS,
  HOSTING_RULES,
  MAX_STATUS,
  MINUTES_PER_HOUR,
  findHostTreat,
  homeLocationId,
  treatServings,
  yearsBetween,
  type HomeTreatDto,
  type HostTreatDefinition,
  type HostTreatId,
  type HostTreatOfferDto,
  type HostingDto,
  type HostingGuestDto,
  type HostingResultDto,
  type ServeTreatRequest,
  type TreatEffects,
  type VisitTreatDto,
} from '@insidelife/shared';
import { In, IsNull, MoreThan, MoreThanOrEqual, type EntityManager } from 'typeorm';
import {
  ConflictException,
  GameRuleException,
  InsufficientFundsException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception.js';
import { FAMILY_PORT, type FamilyPort } from '../../common/ports/family.port.js';
import { CharacterEntity } from '../characters/entities/character.entity.js';
import { NotificationsService, type NotificationDraft } from '../notifications/notifications.service.js';
import { RealtimeBus } from '../realtime-bus/realtime-bus.service.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import type { RowProbe } from '../simulation/row-presence.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { HomeTreatEntity } from './entities/home-treat.entity.js';
import { HomeVisitEntity } from './entities/home-visit.entity.js';
import { closenessGain, dayStart, hostReward, treatProblem } from './hosting.rules.js';
import { PERSON_COLUMNS, toPersonDto, type Person } from './visit-people.js';

const ADULT_AGE = 18;
/** Treats served to this character and not applied yet: almost always none, so the settle skips the read (see `RowProbe`). */
export const PENDING_TREAT_ROWS: RowProbe = { key: 'visits:pending-treats', table: 'home_treats', where: 'guest_id = $1 AND applied_at IS NULL' };

interface GuestInside {
  readonly visitId: string;
  readonly person: Person;
}

/**
 * Hosting: while guests on an accepted visit are inside your home you can treat them (pantry pot, food ordered in,
 * drinks, cake, take-home packs, goodie bags). It is spending, never a transfer: the host pays the vendors through the
 * ledger (`ctx.wallet.pay`, keyed by the client's order key) and feels it in their own session.
 *
 * Guests feel it in THEIR own session: the order writes one `home_treats` row per guest (pending), and every settle of
 * a guest (`VisitsSystem.onSettled` → `applyPending`) applies pending rows exactly once under the guest's row lock.
 * After commit the host nudges each guest (notification + `character:invalidate`) and settles them in the background,
 * so it lands at once; if that nudge is lost the guest's next request applies it anyway. No session ever writes
 * another player's character.
 */
@Injectable()
export class HostingService {
  private readonly logger = new Logger(HostingService.name);

  constructor(
    private readonly session: CharacterSession,
    private readonly notifications: NotificationsService,
    private readonly bus: RealtimeBus,
    @Inject(FAMILY_PORT) private readonly family: FamilyPort,
  ) {}

  // ----- Host --------------------------------------------------------------------------------------------------------

  async view(ctx: SimulationContext): Promise<HostingDto> {
    const host = ctx.character;
    const guests = await this.guestsInside(ctx);
    const active = await this.activeAt(ctx.manager, host.id, ctx.time);
    const atHome = this.atHome(ctx);
    return {
      atHome,
      guests: guests.map((guest) => this.guestDto(ctx, guest)),
      menu: HOST_TREATS.map((def) => this.offer(ctx, def, guests, active, atHome)),
      active,
      pantryMeals: host.pantryMeals,
    };
  }

  async serve(ctx: SimulationContext, request: ServeTreatRequest): Promise<HostingResultDto> {
    const def = findHostTreat(request.treatId);
    if (!def) throw new ResourceNotFoundException('Treat');
    const host = ctx.character;
    const previous = await ctx.manager.find(HomeTreatEntity, {
      where: { hostId: host.id, orderKey: request.idempotencyKey },
    });
    if (previous.length > 0) {
      if (previous[0]?.treatId !== def.id)
        throw new ConflictException(
          'IDEMPOTENCY_KEY_REUSED',
          'That order key was already used for something else',
        );
      return this.result(
        ctx,
        def.id,
        previous.length,
        (previous[0]?.unitPrice ?? 0) * treatServings(def.per, previous.length),
        0,
        true,
      );
    }

    const guests = await this.guestsInside(ctx);
    const active = await this.activeAt(ctx.manager, host.id, ctx.time);
    const { unitPrice, servings, total, pantryNeeded } = this.price(ctx, def, guests.length);
    const problem = treatProblem({
      def,
      atHome: this.atHome(ctx),
      guests: guests.length,
      hostAdult: this.adult(ctx, host.bornAt),
      guestsAdult: guests.every((guest) => this.adult(ctx, guest.person.bornAt)),
      pantryMeals: host.pantryMeals,
      pantryNeeded,
      cash: ctx.wallet.cash,
      total,
      onTable: active.some((treat) => treat.treatId === def.id),
    });
    if (problem?.code === 'INSUFFICIENT_FUNDS') throw new InsufficientFundsException(total);
    if (problem) throw new GameRuleException(problem.code, problem.message);

    // Today's earlier orders decide the host's (capped) reward; count them before writing this one.
    const earlier = await this.ordersToday(ctx);
    const who =
      guests.length === 1 ? (guests[0]?.person.firstName ?? 'your guest') : `${guests.length} guests`;
    if (total > 0) {
      await ctx.wallet.pay(
        total,
        'purchase',
        `${def.name} for ${who} (hosting)`,
        `visit-treat:${request.idempotencyKey}`,
        {
          metadata: { treatId: def.id, guests: guests.length, servings, unitPrice },
        },
      );
    }
    if (pantryNeeded > 0) host.pantryMeals = Math.max(0, host.pantryMeals - pantryNeeded);

    const reward = hostReward(earlier, def);
    if (def.per === 'everyone') this.feel(ctx, def.effects, `treat:${def.id}`, def.name);
    if (reward.rewarded) {
      this.feel(ctx, HOSTING_RULES.hostReward, 'hosting', 'Good host');
      host.status = Math.round(Math.min(MAX_STATUS, Math.max(0, host.status + reward.clout)));
      // Your side of the friendship warms up too (if you know each other).
      for (const guest of guests) await this.family.adjustCloseness(ctx, guest.person.id, def.closeness);
    }

    await ctx.manager.save(
      guests.map((guest) =>
        ctx.manager.create(HomeTreatEntity, {
          hostId: host.id,
          guestId: guest.person.id,
          visitId: guest.visitId,
          treatId: def.id,
          orderKey: request.idempotencyKey,
          unitPrice,
          servedAt: ctx.time,
          until: ctx.time + def.lasts,
          appliedAt: null,
          closeness: 0,
          thankedAt: null,
        }),
      ),
    );

    const title = def.served.replace('{host}', host.firstName);
    for (const guest of guests) {
      await this.notifyOther(ctx, guest.person.id, {
        kind: 'social',
        title,
        body:
          guests.length > 1
            ? `For everyone at ${host.firstName}’s place. Say thanks on the visit card.`
            : 'Enjoy! Say thanks on the visit card.',
        tone: 'good',
      });
      const guestId = guest.person.id;
      // Feel it now (their own session applies it); if they're busy, their next request will.
      ctx.afterCommit(() => {
        this.session
          .settleInBackground(guestId)
          .catch((error: unknown) =>
            this.logger.warn(`Couldn’t settle guest ${guestId} after a treat: ${String(error)}`),
          );
      });
    }
    return this.result(ctx, def.id, guests.length, total, reward.clout, false);
  }

  // ----- Guest -------------------------------------------------------------------------------------------------------

  /** Apply treats served to this character (their own session; every settle). Each row exactly once. */
  async applyPending(ctx: SimulationContext): Promise<void> {
    const me = ctx.character;
    if (!(await ctx.mayHaveRows(PENDING_TREAT_ROWS))) return;
    const pending = await ctx.manager.find(HomeTreatEntity, {
      where: { guestId: me.id, appliedAt: IsNull() },
      order: { servedAt: 'ASC' },
      take: 20,
    });
    if (pending.length === 0) return;
    const hostIds = [...new Set(pending.map((row) => row.hostId))];
    const hosts = new Map(
      (
        await ctx.manager.find(CharacterEntity, {
          where: { id: In(hostIds) },
          select: { id: true, firstName: true },
        })
      ).map((host) => [host.id, host.firstName]),
    );
    const gained = new Map<string, number>();
    for (const hostId of hostIds) gained.set(hostId, await this.closenessToday(ctx, hostId));

    for (const row of pending) {
      const def = findHostTreat(row.treatId);
      if (def && me.alive) {
        const name = hosts.get(row.hostId) ?? 'Your host';
        this.feel(ctx, def.effects, `treat:${row.hostId}`, `${name}’s hospitality`);
        const gain = closenessGain(def.closeness, gained.get(row.hostId) ?? 0);
        if (gain > 0) {
          await this.family.adjustCloseness(ctx, row.hostId, gain);
          gained.set(row.hostId, (gained.get(row.hostId) ?? 0) + gain);
        }
        row.closeness = gain;
      }
      row.appliedAt = ctx.time;
    }
    await ctx.manager.save(pending);
  }

  /** The guest says thank you for everything not yet thanked in this visit (free; once per treat). */
  async thank(ctx: SimulationContext, visitId: string): Promise<void> {
    const me = ctx.character;
    const visit = await ctx.manager.findOne(HomeVisitEntity, { where: { id: visitId, guestId: me.id } });
    if (!visit) throw new ResourceNotFoundException('Visit');
    const rows = await ctx.manager.find(HomeTreatEntity, {
      where: { visitId, guestId: me.id, thankedAt: IsNull() },
    });
    if (rows.length === 0) throw new GameRuleException('NOTHING_TO_THANK', 'You’ve already said thank you');
    for (const row of rows) row.thankedAt = ctx.time;
    await ctx.manager.save(rows);
    const names = [...new Set(rows.map((row) => findHostTreat(row.treatId)?.name.toLowerCase() ?? 'treat'))];
    await this.notifyOther(ctx, visit.hostId, {
      kind: 'social',
      title: `@${me.handle} says thank you 🙏`,
      body: `For the ${names.join(' and the ')}. ${me.firstName} enjoyed it.`,
      tone: 'good',
    });
  }

  // ----- Views for the visits service ------------------------------------------------------------------------------

  /** What's on a home's table right now (latest end per treat). */
  async activeAt(manager: EntityManager, hostId: string, now: number): Promise<HomeTreatDto[]> {
    const rows = await manager.find(HomeTreatEntity, {
      where: { hostId, until: MoreThan(now) },
      select: { treatId: true, until: true },
      take: 100,
    });
    const until = new Map<HostTreatId, number>();
    for (const row of rows) until.set(row.treatId, Math.max(until.get(row.treatId) ?? 0, row.until));
    return [...until].map(([treatId, end]) => ({ treatId, until: end }));
  }

  /** Treats per visit (newest first, up to 10 each). */
  async visitTreats(
    manager: EntityManager,
    visitIds: readonly string[],
  ): Promise<Map<string, VisitTreatDto[]>> {
    const byVisit = new Map<string, VisitTreatDto[]>();
    if (visitIds.length === 0) return byVisit;
    const rows = await manager.find(HomeTreatEntity, {
      where: { visitId: In([...visitIds]) },
      order: { servedAt: 'DESC' },
      take: 10 * visitIds.length,
    });
    for (const row of rows) {
      const list = byVisit.get(row.visitId) ?? [];
      const def = findHostTreat(row.treatId);
      if (list.length < 10 && def) {
        list.push({
          id: row.id,
          treatId: row.treatId,
          name: def.name,
          emoji: def.emoji,
          servedAt: row.servedAt,
          thanked: row.thankedAt !== null,
        });
      }
      byVisit.set(row.visitId, list);
    }
    return byVisit;
  }

  // ----- Internals -------------------------------------------------------------------------------------------------

  private atHome(ctx: SimulationContext): boolean {
    return ctx.character.locationId === homeLocationId(ctx.character.id) && ctx.character.travel === null;
  }

  private adult(ctx: SimulationContext, bornAt: number): boolean {
    return yearsBetween(bornAt, ctx.time) >= ADULT_AGE;
  }

  /** Guests on an accepted, unexpired visit who are inside your home right now. */
  private async guestsInside(ctx: SimulationContext): Promise<GuestInside[]> {
    const host = ctx.character;
    const visits = await ctx.manager.find(HomeVisitEntity, {
      where: { hostId: host.id, status: 'accepted', expiresAt: MoreThan(ctx.time) },
      take: 20,
    });
    if (visits.length === 0) return [];
    const people = await ctx.manager.find(CharacterEntity, {
      where: {
        id: In(visits.map((visit) => visit.guestId)),
        locationId: homeLocationId(host.id),
        alive: true,
        hiddenAt: IsNull(),
      },
      select: PERSON_COLUMNS,
    });
    const visitOf = new Map(visits.map((visit) => [visit.guestId, visit.id]));
    return people.flatMap((person) => {
      const visitId = visitOf.get(person.id);
      return visitId ? [{ visitId, person }] : [];
    });
  }

  private price(ctx: SimulationContext, def: HostTreatDefinition, guests: number) {
    const servings = treatServings(def.per, guests);
    const unitPrice = def.price > 0 ? ctx.world.price(def.price, ctx.time) : 0;
    return {
      unitPrice,
      servings,
      total: unitPrice * servings,
      pantryNeeded: (def.pantryMeals ?? 0) * servings,
    };
  }

  private offer(
    ctx: SimulationContext,
    def: HostTreatDefinition,
    guests: readonly GuestInside[],
    active: readonly HomeTreatDto[],
    atHome: boolean,
  ): HostTreatOfferDto {
    const { unitPrice, servings, total, pantryNeeded } = this.price(ctx, def, guests.length);
    const problem = treatProblem({
      def,
      atHome,
      guests: guests.length,
      hostAdult: this.adult(ctx, ctx.character.bornAt),
      guestsAdult: guests.every((guest) => this.adult(ctx, guest.person.bornAt)),
      pantryMeals: ctx.character.pantryMeals,
      pantryNeeded,
      cash: ctx.wallet.cash,
      total,
      onTable: active.some((treat) => treat.treatId === def.id),
    });
    return {
      id: def.id,
      kind: def.kind,
      name: def.name,
      emoji: def.emoji,
      blurb: def.blurb,
      per: def.per,
      unitPrice,
      servings,
      total,
      pantryMeals: pantryNeeded,
      adultsOnly: def.adultsOnly === true,
      unavailable: problem?.message ?? null,
    };
  }

  private guestDto(ctx: SimulationContext, guest: GuestInside): HostingGuestDto {
    return {
      visitId: guest.visitId,
      person: toPersonDto(guest.person),
      adult: this.adult(ctx, guest.person.bornAt),
    };
  }

  /** Treats this host served today, oldest first (one per order). */
  private async ordersToday(ctx: SimulationContext): Promise<HostTreatId[]> {
    const rows = await ctx.manager.find(HomeTreatEntity, {
      where: { hostId: ctx.character.id, servedAt: MoreThanOrEqual(dayStart(ctx.time)) },
      select: { orderKey: true, treatId: true, servedAt: true },
      order: { servedAt: 'ASC' },
      take: 200,
    });
    const orders = new Map<string, HostTreatId>();
    for (const row of rows) if (!orders.has(row.orderKey)) orders.set(row.orderKey, row.treatId);
    return [...orders.values()];
  }

  /** Closeness this guest already gained from this host today. */
  private async closenessToday(ctx: SimulationContext, hostId: string): Promise<number> {
    const rows = await ctx.manager.find(HomeTreatEntity, {
      where: { guestId: ctx.character.id, hostId, appliedAt: MoreThanOrEqual(dayStart(ctx.time)) },
      select: { id: true, closeness: true },
      take: 200,
    });
    return rows.reduce((sum, row) => sum + row.closeness, 0);
  }

  /** Need boosts now and a mood lift for a while (the stronger lift wins if one is already running). */
  private feel(ctx: SimulationContext, effects: TreatEffects, moodId: string, label: string): void {
    const character = ctx.character;
    const needs = { ...character.needs };
    if (effects.hunger) needs.hunger = Math.min(100, needs.hunger + effects.hunger);
    if (effects.social) needs.social = Math.min(100, needs.social + effects.social);
    if (effects.fun) needs.fun = Math.min(100, needs.fun + effects.fun);
    character.needs = needs;
    if (!effects.mood) return;
    const until = ctx.time + (effects.moodHours ?? 6) * MINUTES_PER_HOUR;
    const current = character.moodModifiers.find((modifier) => modifier.id === moodId);
    character.moodModifiers = [
      ...character.moodModifiers.filter((modifier) => modifier.id !== moodId),
      {
        id: moodId,
        label,
        value: Math.max(effects.mood, current?.value ?? 0),
        until: Math.max(until, current?.until ?? 0),
      },
    ];
  }

  private async result(
    ctx: SimulationContext,
    treatId: HostTreatId,
    guests: number,
    total: number,
    cloutGained: number,
    replayed: boolean,
  ): Promise<HostingResultDto> {
    return {
      treatId,
      guests,
      total,
      balanceAfter: ctx.wallet.cash,
      cloutGained,
      replayed,
      hosting: await this.view(ctx),
    };
  }

  /** Notify another player: the row is written in this transaction, pushed (with a refetch nudge) after commit. */
  private async notifyOther(
    ctx: SimulationContext,
    recipientId: string,
    draft: Omit<NotificationDraft, 'gameMinute'>,
  ): Promise<void> {
    const created = await this.notifications.create(ctx.manager, recipientId, [
      { ...draft, gameMinute: ctx.time },
    ]);
    ctx.afterCommit(() => {
      this.notifications.push(recipientId, created);
      this.bus.toCharacter(recipientId, 'character:invalidate', { reason: 'visit' });
    });
  }
}
