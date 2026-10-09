import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  homeEntrance,
  homeKey,
  homeLocationId,
  NO_DECOR,
  VISIT_RULES,
  type DistrictId,
  type Entrance,
  type HomePeopleDto,
  type VisitDto,
  type VisitsDto,
} from '@insidelife/shared';
import { In, IsNull, MoreThan, type EntityManager } from 'typeorm';
import {
  ForbiddenActionException,
  GameRuleException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception.js';
import { HOUSEHOLD_PORT, type HouseholdPort } from '../../common/ports/household.port.js';
import { INVENTORY_PORT, type InventoryPort } from '../../common/ports/inventory.port.js';
import { CharacterEntity } from '../characters/entities/character.entity.js';
import { NotificationsService, type NotificationDraft } from '../notifications/notifications.service.js';
import { RealtimeBus } from '../realtime-bus/realtime-bus.service.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SocialGuard } from '../social/social-guard.service.js';
import { HomeVisitEntity, type VisitHomeSnapshot } from './entities/home-visit.entity.js';
import { HostingService } from './hosting.service.js';
import { PERSON_COLUMNS, toPersonDto, type Person } from './visit-people.js';
import { canEnter, hostOf, isOpenVisit, normaliseHandle, visitExpiry } from './visits.rules.js';

const OPEN = ['invited', 'accepted'] as const;

/**
 * Inviting players over. The host invites by handle (blocks respected); the guest accepts and can then walk in
 * through the host's door, or ride there, until the visit expires or either of them ends it. The guest sees the
 * host's home as it was when the invite went out (furnishing included) and both see each other inside.
 */
@Injectable()
export class VisitsService {
  private readonly logger = new Logger(VisitsService.name);

  constructor(
    private readonly session: CharacterSession,
    @Inject(HOUSEHOLD_PORT) private readonly household: HouseholdPort,
    @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort,
    private readonly guard: SocialGuard,
    private readonly notifications: NotificationsService,
    private readonly bus: RealtimeBus,
    private readonly hosting: HostingService,
  ) {}

  async list(ctx: SimulationContext): Promise<VisitsDto> {
    const me = ctx.character.id;
    const visits = await ctx.manager.find(HomeVisitEntity, {
      where: [
        { hostId: me, status: In([...OPEN]), expiresAt: MoreThan(ctx.time) },
        { guestId: me, status: In([...OPEN]), expiresAt: MoreThan(ctx.time) },
      ],
      order: { invitedAt: 'DESC' },
      take: 50,
    });
    const dtos = await this.toDtos(ctx, visits);
    return {
      incoming: dtos.filter((visit) => visit.role === 'guest'),
      outgoing: dtos.filter((visit) => visit.role === 'host'),
    };
  }

  async invite(ctx: SimulationContext, handle: string): Promise<VisitDto> {
    const host = ctx.character;
    const guest = await ctx.manager.findOne(CharacterEntity, {
      where: { handle: normaliseHandle(handle), alive: true, hiddenAt: IsNull() },
      select: PERSON_COLUMNS,
    });
    if (!guest) throw new ResourceNotFoundException('Player');
    if (guest.id === host.id)
      throw new GameRuleException('SELF_INVITE', 'It’s your own house — no invite needed');
    if (await this.guard.isBlocked(host.id, guest.id, ctx.manager))
      throw new GameRuleException('BLOCKED', `You can’t invite @${guest.handle}`);

    const home = await this.homeSnapshot(ctx);
    const existing = await ctx.manager.findOne(HomeVisitEntity, {
      where: { hostId: host.id, guestId: guest.id, status: In([...OPEN]), expiresAt: MoreThan(ctx.time) },
      lock: { mode: 'pessimistic_write' },
    });
    let visit: HomeVisitEntity;
    if (existing) {
      // Inviting again refreshes the room they'll see and the clock.
      existing.home = home;
      existing.expiresAt = visitExpiry(ctx.time);
      visit = await ctx.manager.save(existing);
    } else {
      const open = await ctx.manager.count(HomeVisitEntity, {
        where: { hostId: host.id, status: In([...OPEN]), expiresAt: MoreThan(ctx.time) },
      });
      if (open >= VISIT_RULES.maxOpenInvites) {
        throw new GameRuleException(
          'TOO_MANY_INVITES',
          `You already have ${VISIT_RULES.maxOpenInvites} people invited. End a visit first.`,
        );
      }
      visit = await ctx.manager.save(
        ctx.manager.create(HomeVisitEntity, {
          hostId: host.id,
          guestId: guest.id,
          status: 'invited',
          home,
          invitedAt: ctx.time,
          expiresAt: visitExpiry(ctx.time),
          respondedAt: null,
        }),
      );
    }
    if (visit.status === 'invited') {
      await this.notifyOther(ctx, guest.id, {
        kind: 'social',
        title: `@${host.handle} invited you over 🏠`,
        body: `${host.firstName}’s place — ${home.label}. Accept on the invite card to get directions.`,
        tone: 'good',
      });
    }
    const [dto] = await this.toDtos(ctx, [visit]);
    return dto as VisitDto;
  }

  async accept(ctx: SimulationContext, visitId: string): Promise<VisitDto> {
    const visit = await this.lockOpen(ctx, visitId);
    if (visit.guestId !== ctx.character.id)
      throw new ForbiddenActionException('Only the person invited can accept');
    if (visit.status !== 'accepted') {
      visit.status = 'accepted';
      visit.respondedAt = ctx.time;
      visit.expiresAt = visitExpiry(ctx.time);
      await ctx.manager.save(visit);
      await this.notifyOther(ctx, visit.hostId, {
        kind: 'social',
        title: `@${ctx.character.handle} is coming over`,
        body: `${ctx.character.firstName} accepted your invite. Tidy up small.`,
        tone: 'good',
      });
    }
    const [dto] = await this.toDtos(ctx, [visit]);
    return dto as VisitDto;
  }

  async decline(ctx: SimulationContext, visitId: string): Promise<void> {
    const visit = await this.lockOpen(ctx, visitId);
    if (visit.guestId !== ctx.character.id)
      throw new ForbiddenActionException('Only the person invited can decline');
    visit.status = 'declined';
    visit.respondedAt = ctx.time;
    await ctx.manager.save(visit);
    this.invalidate(ctx, visit.hostId);
  }

  /** Host or guest calls it a day. A guest still inside heads home on their next update. */
  async end(ctx: SimulationContext, visitId: string): Promise<void> {
    const me = ctx.character;
    const visit = await this.lockOpen(ctx, visitId);
    if (visit.hostId !== me.id && visit.guestId !== me.id) throw new ResourceNotFoundException('Visit');
    visit.status = 'ended';
    visit.respondedAt ??= ctx.time;
    await ctx.manager.save(visit);
    if (visit.guestId === me.id) {
      // Leaving from the invite card while still inside: straight home.
      await this.evictIfUninvited(ctx);
      this.invalidate(ctx, visit.hostId);
      return;
    }
    const guest = await ctx.manager.findOne(CharacterEntity, {
      where: { id: visit.guestId },
      select: { id: true, locationId: true },
    });
    if (guest?.locationId === homeLocationId(me.id)) {
      // The guest is in the house: see them out now (in their own session, after this commits).
      const host = `@${me.handle}`;
      ctx.afterCommit(() => {
        this.session
          .run({ characterId: visit.guestId }, (guestCtx) =>
            this.evictIfUninvited(guestCtx, `${host} called it a day. You headed home.`),
          )
          .catch((error: unknown) =>
            this.logger.warn(`Couldn’t see guest ${visit.guestId} out: ${String(error)}`),
          );
      });
      return;
    }
    await this.notifyOther(ctx, visit.guestId, {
      kind: 'social',
      title: `Invite from @${me.handle} cancelled`,
      body: `${me.firstName} can’t host you this time.`,
      tone: 'neutral',
    });
  }

  /** The host and guests in a home right now (not you). Only the host and invited guests can look. */
  async people(ctx: SimulationContext, hostId: string): Promise<HomePeopleDto> {
    const me = ctx.character;
    const locationId = homeLocationId(hostId);
    if (me.id !== hostId && me.locationId !== locationId && !(await this.acceptedVisit(ctx, hostId)))
      throw new ResourceNotFoundException('Home');
    const here = await ctx.manager.find(CharacterEntity, {
      where: { locationId, alive: true, hiddenAt: IsNull() },
      select: PERSON_COLUMNS,
      take: 20,
    });
    return {
      locationId,
      people: here
        .filter((person) => person.id !== me.id)
        .map((person) => ({
          ...toPersonDto(person),
          activity: person.activity?.actionId ?? null,
          role: person.id === hostId ? 'host' : 'guest',
        })),
      treats: await this.hosting.activeAt(ctx.manager, hostId, ctx.time),
    };
  }

  // ----- Port --------------------------------------------------------------------------------------------------

  async invitedDoor(ctx: SimulationContext, hostId: string): Promise<Entrance | null> {
    return (await this.acceptedVisit(ctx, hostId)) ? this.doorOf(ctx, hostId) : null;
  }

  async doorOf(ctx: SimulationContext, hostId: string): Promise<Entrance | null> {
    const host = await ctx.manager.findOne(CharacterEntity, {
      where: { id: hostId },
      select: { id: true, homePropertyId: true, homeDistrictId: true },
    });
    return host
      ? homeEntrance(homeKey(host.id, host.homePropertyId), host.homeDistrictId as DistrictId)
      : null;
  }

  /** Guest standing in someone else's home without a live invite: send them home. */
  async evictIfUninvited(
    ctx: SimulationContext,
    body = 'The visit is over. Thank them for having you!',
  ): Promise<void> {
    const character = ctx.character;
    const hostId = hostOf(character.locationId);
    if (!hostId || hostId === character.id) return;
    if (await this.acceptedVisit(ctx, hostId)) return;
    character.locationId = homeLocationId(character.id);
    character.activity = null;
    ctx.notify({ kind: 'social', title: 'You headed home', body, tone: 'neutral' });
  }

  /** Still on an accepted visit at this location (a host's home)? */
  async stayingOn(ctx: SimulationContext, locationId: string): Promise<boolean> {
    const hostId = hostOf(locationId);
    if (!hostId || hostId === ctx.character.id || ctx.character.locationId !== locationId) return false;
    return (await this.acceptedVisit(ctx, hostId)) !== null;
  }

  // ----- Internals ---------------------------------------------------------------------------------------------

  private async acceptedVisit(ctx: SimulationContext, hostId: string): Promise<HomeVisitEntity | null> {
    const visit = await ctx.manager.findOne(HomeVisitEntity, {
      where: { hostId, guestId: ctx.character.id, status: 'accepted', expiresAt: MoreThan(ctx.time) },
    });
    return visit && canEnter(visit, ctx.time) ? visit : null;
  }

  private async lockOpen(ctx: SimulationContext, visitId: string): Promise<HomeVisitEntity> {
    const visit = await ctx.manager.findOne(HomeVisitEntity, {
      where: { id: visitId },
      lock: { mode: 'pessimistic_write' },
    });
    const me = ctx.character.id;
    if (!visit || (visit.hostId !== me && visit.guestId !== me)) throw new ResourceNotFoundException('Visit');
    if (!isOpenVisit(visit, ctx.time)) throw new GameRuleException('VISIT_OVER', 'That invite has ended');
    return visit;
  }

  private async homeSnapshot(ctx: SimulationContext): Promise<VisitHomeSnapshot> {
    const home = await this.household.home(ctx);
    const owned = await this.inventory.owned(ctx);
    return {
      label: home.label,
      districtId: home.districtId,
      ownership: home.ownership,
      comfort: home.comfort,
      items: [...new Set(owned.map((item) => item.itemId))],
    };
  }

  private async toDtos(ctx: SimulationContext, visits: readonly HomeVisitEntity[]): Promise<VisitDto[]> {
    if (visits.length === 0) return [];
    const ids = [...new Set(visits.flatMap((visit) => [visit.hostId, visit.guestId]))];
    const people = new Map((await this.load(ctx.manager, ids)).map((person) => [person.id, person]));
    const treats = await this.hosting.visitTreats(
      ctx.manager,
      visits.map((visit) => visit.id),
    );
    const me = ctx.character.id;
    return visits.flatMap((visit): VisitDto[] => {
      const host = people.get(visit.hostId);
      const guest = people.get(visit.guestId);
      if (!host || !guest) return [];
      const locationId = homeLocationId(host.id);
      return [
        {
          id: visit.id,
          status: visit.status,
          role: visit.hostId === me ? 'host' : 'guest',
          host: toPersonDto(host),
          guest: toPersonDto(guest),
          home: {
            locationId,
            ...visit.home,
            decor: visit.home.decor ?? NO_DECOR,
            entrance: homeEntrance(homeKey(host.id, host.homePropertyId), host.homeDistrictId as DistrictId),
          },
          createdAt: visit.invitedAt,
          expiresAt: visit.expiresAt,
          guestInside: guest.locationId === locationId,
          treats: treats.get(visit.id) ?? [],
        },
      ];
    });
  }

  private load(manager: EntityManager, ids: readonly string[]): Promise<Person[]> {
    return manager.find(CharacterEntity, { where: { id: In([...ids]) }, select: PERSON_COLUMNS });
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

  private invalidate(ctx: SimulationContext, recipientId: string): void {
    ctx.afterCommit(() => this.bus.toCharacter(recipientId, 'character:invalidate', { reason: 'visit' }));
  }
}
