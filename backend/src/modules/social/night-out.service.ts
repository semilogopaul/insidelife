import { Injectable } from '@nestjs/common';
import { In, MoreThan } from 'typeorm';
import {
  NIGHT_OUT_ITEMS,
  NIGHT_OUT_ITEM_IDS,
  NIGHT_OUT_RULES,
  NIGHT_OUT_VENUE_TYPES,
  findVenue,
  isVenueOpen,
  nextShoutoutSlot,
  nightOutBasePrice,
  nightOutClout,
  nightOutEndsAt,
  realMsAt,
  sprayNightIndex,
  toDateParts,
  yearsBetween,
  type ChatMessageDto,
  type NightOutDto,
  type NightOutItemDefinition,
  type NightOutOfferDto,
  type NightOutRequest,
  type NightOutResultDto,
  type VenueDefinition,
  type VenueMomentDto,
  type VenueMomentPersonDto,
} from '@insidelife/shared';
import { ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import { CharacterEntity } from '../characters/entities/character.entity.js';
import { PresenceService } from '../presence/presence.service.js';
import { ChatService } from '../realtime/chat.service.js';
import { RealtimeBus } from '../realtime-bus/realtime-bus.service.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { NightMomentEntity } from './entities/night-moment.entity.js';
import {
  DJ_LINES,
  bottlePhrase,
  checkNightOutOffer,
  checkNightOutTarget,
  checkNightOutVenue,
  checkShoutoutMessage,
  momentChatLine,
  type NightOutRecipient,
} from './rules/night-out.rules.js';
import { addMood, adjustStatus, boostNeeds } from './social-effects.js';
import { assertRule, normaliseHandle, playerNotFound, ruleException } from './social-errors.js';
import { SocialGuard } from './social-guard.service.js';
import { SocialNotifier } from './social-notifier.service.js';

/** Everyone in the room who sees the moment (an instance holds ~200 people). */
const AUDIENCE = 200;
/** Moments listed for someone who just walked in. */
const LIST_LIMIT = 40;

interface NightTally {
  /** Paid moments tonight, anywhere. */
  readonly count: number;
  readonly clout: number;
  /** item id → bought at this place tonight. */
  readonly here: ReadonlyMap<string, number>;
  /** Bottles sent per recipient tonight (anywhere). */
  readonly bottlesTo: ReadonlyMap<string, number>;
}

interface VenueNight {
  readonly moments: readonly NightMomentEntity[];
  readonly vip: NightMomentEntity | null;
  /** Shoutouts not yet on screen. */
  readonly waiting: readonly NightMomentEntity[];
  /** When the last queued shoutout ends (epoch ms), if any. */
  readonly queueEndsAt: number | null;
}

/**
 * Club nights: buy a bottle for someone in the room, a DJ shoutout (your name in bold on everyone's screen) or an
 * experience (birthday package, champagne shower, confetti cannon, the VIP section, tips). Every naira leaves the
 * game (a sink); the buyer earns clout within a nightly cap. Everyone present gets `venue:moment` and a system line
 * in the venue chat. Shoutouts queue per place (one on screen at a time): purchases at a place serialise on a
 * transaction-scoped advisory lock while the next slot is taken.
 *
 * Effects on another player (a bottle or birthday lifting their mood) are never written to their character here: the
 * row is a pending effect (`recipientApplied = false`) that their own session claims and applies on settle
 * (`applyReceived`, from `SocialSystem.onSettled`).
 */
@Injectable()
export class NightOutService {
  constructor(
    private readonly bus: RealtimeBus,
    private readonly presence: PresenceService,
    private readonly guard: SocialGuard,
    private readonly notifier: SocialNotifier,
    private readonly chat: ChatService,
  ) {}

  /** The menu priced for you, what's playing or queued here, and your night so far. */
  async view(ctx: SimulationContext, venueId: string): Promise<NightOutDto> {
    const venue = this.venue(venueId);
    const nowMs = Date.now();
    const night = sprayNightIndex(ctx.time);
    const [tally, here, blocked] = await Promise.all([
      this.tally(ctx, venueId, night),
      this.venueNight(ctx, venueId, night, nowMs),
      this.guard.blockedIds(ctx.character.id, ctx.manager),
    ]);
    const gate = checkNightOutVenue(this.venueInput(ctx, venue));
    const offers = NIGHT_OUT_ITEM_IDS.map((id) => this.offer(ctx, venue, NIGHT_OUT_ITEMS[id], tally, here));
    const mine = here.waiting.find((moment) => moment.fromId === ctx.character.id) ?? null;
    return {
      venueId,
      venueName: venue.name,
      serverNow: nowMs,
      closedReason: gate.ok ? null : gate.message,
      offers,
      moments: here.moments.filter((moment) => !blocked.has(moment.fromId)).map((moment) => this.toMoment(moment)),
      vip: here.vip ? this.from(here.vip) : null,
      you: {
        adult: ctx.age >= NIGHT_OUT_RULES.minAge,
        cash: ctx.wallet.cash,
        momentsTonight: tally.count,
        momentsLeftTonight: Math.max(0, NIGHT_OUT_RULES.maxMomentsPerNight - tally.count),
        cloutTonight: tally.clout,
        queuedShoutoutAt: mine ? mine.startsAt.getTime() : null,
      },
    };
  }

  async buy(ctx: SimulationContext, venueId: string, request: NightOutRequest): Promise<NightOutResultDto> {
    const sender = ctx.character;
    const previous = await ctx.manager.findOne(NightMomentEntity, { where: { fromId: sender.id, idempotencyKey: request.idempotencyKey } });
    if (previous) return this.replayed(ctx, previous);

    const venue = this.venue(venueId);
    const item = NIGHT_OUT_ITEMS[request.itemId];
    // One purchase at a time per place: the shoutout queue and the VIP section are taken under this lock.
    await ctx.manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`night-out:${venueId}`]);

    const nowMs = Date.now();
    const night = sprayNightIndex(ctx.time);
    const [tally, here] = await Promise.all([this.tally(ctx, venueId, night), this.venueNight(ctx, venueId, night, nowMs)]);
    const offer = this.offerInput(ctx, venue, item, tally, here);
    assertRule(checkNightOutOffer(offer));

    // Who it's for. A birthday "for" yourself is just your birthday.
    const recipient = await this.recipient(ctx, item, request.toHandle ?? null, tally);
    assertRule(checkNightOutTarget(item, sender.id, recipient?.check ?? null));
    const to = recipient && recipient.entity.id !== sender.id ? recipient.entity : null;

    let message: string | null = null;
    if (item.kind === 'shoutout') {
      const check = checkShoutoutMessage(request.message);
      if (!check.ok) throw ruleException(check.code, check.message);
      await this.assertMentionsAllowed(ctx, check.mentions);
      message = check.message || `${ctx.character.firstName} ${ctx.rng('dj-line', request.idempotencyKey).pick(DJ_LINES)}`;
    }

    // Spending at the club, never a transfer: no counterparty, so it can't count toward player-to-player limits.
    const price = offer.price;
    await ctx.wallet.pay(price, 'purchase', this.memo(item, venue, to), `night-out:${request.idempotencyKey}`, {
      metadata: { venueId, itemId: item.id, ...(to ? { forHandle: to.handle } : {}) },
    });
    const cloutGained = nightOutClout(item, tally.clout);
    adjustStatus(ctx, cloutGained);

    const startsAt = item.kind === 'shoutout' ? nextShoutoutSlot(here.queueEndsAt, nowMs) : nowMs;
    const durationMs = item.kind === 'vip-section' ? Math.max(60_000, Math.round(realMsAt(ctx.world.clock, nightOutEndsAt(venue, ctx.time)) - nowMs)) : item.durationMs;
    const mood = to ? (item.recipientMood ?? 0) : 0;
    const row = await ctx.manager.save(
      ctx.manager.create(NightMomentEntity, {
        venueId,
        night,
        itemId: item.id,
        kind: item.kind,
        fromId: sender.id,
        fromHandle: sender.handle,
        fromFirstName: sender.firstName,
        toId: to?.id ?? null,
        toHandle: to?.handle ?? null,
        toFirstName: to?.firstName ?? null,
        message,
        price,
        clout: cloutGained,
        startsAt: new Date(startsAt),
        endsAt: new Date(startsAt + durationMs),
        gameMinute: ctx.time,
        idempotencyKey: request.idempotencyKey,
        recipientMood: mood,
        recipientApplied: mood <= 0,
      }),
    );
    const moment = this.toMoment(row);

    const line = await this.chat.postVenueSystemLine(ctx.manager, sender, venueId, momentChatLine({ item, from: sender.handle, to: to?.handle ?? null, message }));
    if (to) {
      await this.notifier.notify(
        ctx,
        to.id,
        item.kind === 'bottle'
          ? { kind: 'social', title: `${item.emoji} @${sender.handle} sent you ${bottlePhrase(item.id)}`, body: `At ${venue.name}. Cheers — enjoy it!`, tone: 'good' }
          : { kind: 'social', title: `${item.emoji} @${sender.handle} threw you a birthday moment`, body: `At ${venue.name}. Cake, sparklers, and the whole room singing for you.`, tone: 'good' },
        'night-out',
      );
    }
    this.announce(ctx, moment, line, to?.id ?? null);

    return {
      moment,
      price,
      balanceAfter: ctx.wallet.cash,
      cloutGained,
      queueAhead: item.kind === 'shoutout' ? here.waiting.length : 0,
      replayed: false,
    };
  }

  /**
   * In the recipient's own session (on settle): claim bottles and birthdays others bought for them and apply the mood
   * lift. The claim is one indexed UPDATE, so it's cheap when nothing is waiting and can never apply a gift twice.
   */
  async applyReceived(ctx: SimulationContext): Promise<void> {
    const rows: Array<{ item_id: string; from_handle: string; recipient_mood: number; game_minute: string }> = await ctx.manager.query(
      `WITH claimed AS (
         UPDATE social_night_moments SET recipient_applied = true
         WHERE to_id = $1 AND recipient_applied = false
         RETURNING item_id, from_handle, recipient_mood, game_minute
       ) SELECT * FROM claimed ORDER BY game_minute`,
      [ctx.character.id],
    );
    for (const row of rows) {
      const item = NIGHT_OUT_ITEMS[row.item_id as keyof typeof NIGHT_OUT_ITEMS];
      const remaining = Number(row.game_minute) + NIGHT_OUT_RULES.recipientMoodMinutes - ctx.time;
      if (!item || row.recipient_mood <= 0 || remaining <= 0) continue;
      const label = item.kind === 'bottle' ? `@${row.from_handle} sent you a bottle` : `@${row.from_handle} threw you a birthday`;
      addMood(ctx, `night-out:${item.kind}`, label, row.recipient_mood, remaining);
      boostNeeds(ctx, { social: 8, fun: 6 });
    }
  }

  // ----- helpers ---------------------------------------------------------------------------------------------------

  private venue(venueId: string): VenueDefinition {
    const venue = findVenue(venueId);
    if (!venue || venue.regionId) throw new ResourceNotFoundException('Venue');
    return venue;
  }

  private venueInput(ctx: SimulationContext, venue: VenueDefinition) {
    return {
      nightlife: (NIGHT_OUT_VENUE_TYPES as readonly string[]).includes(venue.type),
      senderHere: ctx.character.locationId === venue.id && ctx.character.travel === null,
      open: isVenueOpen(venue, toDateParts(ctx.time).hour),
      senderAge: ctx.age,
    };
  }

  private offerInput(ctx: SimulationContext, venue: VenueDefinition, item: NightOutItemDefinition, tally: NightTally, here: VenueNight) {
    return {
      ...this.venueInput(ctx, venue),
      item,
      venueType: venue.type,
      boughtHereTonight: tally.here.get(item.id) ?? 0,
      momentsTonight: tally.count,
      vipHolder: here.vip?.fromHandle ?? null,
      shoutoutsWaiting: here.waiting.length,
      yoursWaiting: here.waiting.filter((moment) => moment.fromId === ctx.character.id).length,
      price: ctx.world.price(nightOutBasePrice(item, venue), ctx.time),
      senderCash: ctx.wallet.cash,
    };
  }

  private offer(ctx: SimulationContext, venue: VenueDefinition, item: NightOutItemDefinition, tally: NightTally, here: VenueNight): NightOutOfferDto {
    const input = this.offerInput(ctx, venue, item, tally, here);
    const check = checkNightOutOffer(input);
    return {
      id: item.id,
      section: item.section,
      kind: item.kind,
      label: item.label,
      emoji: item.emoji,
      blurb: item.blurb,
      shows: item.shows,
      price: input.price,
      clout: nightOutClout(item, tally.clout),
      durationMs: item.durationMs,
      target: item.target,
      leftTonight: Math.max(0, item.perNight - input.boughtHereTonight),
      unavailable: check.ok ? null : check.message,
    };
  }

  /** Everything this character bought tonight (a handful of rows: capped per night). */
  private async tally(ctx: SimulationContext, venueId: string, night: number): Promise<NightTally> {
    const rows = await ctx.manager.find(NightMomentEntity, {
      where: { fromId: ctx.character.id, night },
      select: { id: true, venueId: true, itemId: true, kind: true, toId: true, clout: true },
    });
    const here = new Map<string, number>();
    const bottlesTo = new Map<string, number>();
    let clout = 0;
    for (const row of rows) {
      clout += row.clout;
      if (row.venueId === venueId) here.set(row.itemId, (here.get(row.itemId) ?? 0) + 1);
      if (row.kind === 'bottle' && row.toId) bottlesTo.set(row.toId, (bottlesTo.get(row.toId) ?? 0) + 1);
    }
    return { count: rows.length, clout, here, bottlesTo };
  }

  /** What's playing or queued at this place, the VIP holder and the shoutout queue. */
  private async venueNight(ctx: SimulationContext, venueId: string, night: number, nowMs: number): Promise<VenueNight> {
    const now = new Date(nowMs);
    const [moments, shoutouts] = await Promise.all([
      ctx.manager.find(NightMomentEntity, { where: { venueId, endsAt: MoreThan(now) }, order: { startsAt: 'ASC' }, take: LIST_LIMIT }),
      ctx.manager.find(NightMomentEntity, { where: { venueId, kind: 'shoutout', endsAt: MoreThan(now) }, order: { startsAt: 'ASC' } }),
    ]);
    const vip =
      moments.find((moment) => moment.kind === 'vip-section' && moment.night === night) ??
      (await ctx.manager.findOne(NightMomentEntity, { where: { venueId, night, kind: 'vip-section', endsAt: MoreThan(now) } }));
    const queueEndsAt = shoutouts.reduce<number | null>((latest, moment) => Math.max(latest ?? 0, moment.endsAt.getTime()), null);
    return { moments, vip, waiting: shoutouts.filter((moment) => moment.startsAt.getTime() > nowMs), queueEndsAt };
  }

  private async recipient(
    ctx: SimulationContext,
    item: NightOutItemDefinition,
    toHandle: string | null,
    tally: NightTally,
  ): Promise<{ entity: CharacterEntity; check: NightOutRecipient } | null> {
    if (item.target === 'none' || !toHandle) return null;
    const handle = normaliseHandle(toHandle);
    if (handle === ctx.character.handle) return { entity: ctx.character, check: { id: ctx.character.id, age: ctx.age, here: true, blocked: false, bottlesFromYouTonight: 0 } };
    const entity = await ctx.manager.findOne(CharacterEntity, {
      where: { handle, alive: true },
      select: { id: true, handle: true, firstName: true, lastName: true, bornAt: true, locationId: true, travel: true, status: true },
    });
    if (!entity) throw playerNotFound();
    return {
      entity,
      check: {
        id: entity.id,
        age: yearsBetween(entity.bornAt, ctx.time),
        here: entity.locationId === ctx.character.locationId && entity.travel === null,
        blocked: await this.guard.isBlocked(ctx.character.id, entity.id, ctx.manager),
        bottlesFromYouTonight: tally.bottlesTo.get(entity.id) ?? 0,
      },
    };
  }

  /** @mentions in a shoutout can't name someone who blocked you (or whom you blocked). */
  private async assertMentionsAllowed(ctx: SimulationContext, handles: readonly string[]): Promise<void> {
    if (handles.length === 0) return;
    const mentioned = await ctx.manager.find(CharacterEntity, { where: { handle: In([...handles]) }, select: { id: true } });
    for (const character of mentioned) {
      if (await this.guard.isBlocked(ctx.character.id, character.id, ctx.manager)) {
        throw ruleException('SHOUTOUT_MENTION', 'The DJ can’t shout out that player for you');
      }
    }
  }

  private memo(item: NightOutItemDefinition, venue: VenueDefinition, to: Pick<CharacterEntity, 'handle'> | null): string {
    if (item.kind === 'bottle') return `Sent @${to?.handle ?? 'someone'} ${bottlePhrase(item.id)} at ${venue.name}`;
    if (item.kind === 'birthday' && to) return `Birthday package for @${to.handle} at ${venue.name}`;
    return `${item.label} at ${venue.name}`;
  }

  /** After commit: the system line to the venue chat and the moment to everyone in the room (minus blocks). */
  private announce(ctx: SimulationContext, moment: VenueMomentDto, line: ChatMessageDto, recipientId: string | null): void {
    const senderId = ctx.character.id;
    ctx.afterCommit(async () => {
      this.bus.toRoom(line.channel, 'chat:message', line);
      const [players, blocked] = await Promise.all([this.presence.playersAt(moment.venueId, AUDIENCE), this.guard.blockedIds(senderId)]);
      const audience = new Set([senderId, ...(recipientId ? [recipientId] : []), ...players.map((player) => player.characterId)]);
      for (const id of audience) if (!blocked.has(id)) this.bus.toCharacter(id, 'venue:moment', moment);
    });
  }

  private from(row: NightMomentEntity): VenueMomentPersonDto {
    return { characterId: row.fromId, handle: row.fromHandle, firstName: row.fromFirstName };
  }

  private toMoment(row: NightMomentEntity): VenueMomentDto {
    const item = NIGHT_OUT_ITEMS[row.itemId];
    return {
      id: row.id,
      venueId: row.venueId,
      kind: row.kind,
      from: this.from(row),
      to: row.toId && row.toHandle ? { characterId: row.toId, handle: row.toHandle, firstName: row.toFirstName ?? row.toHandle } : null,
      label: item.label,
      emoji: item.emoji,
      tier: row.itemId,
      effect: item.effect,
      message: row.message,
      durationMs: row.endsAt.getTime() - row.startsAt.getTime(),
      startsAt: row.startsAt.getTime(),
    };
  }

  private replayed(ctx: SimulationContext, row: NightMomentEntity): NightOutResultDto {
    return { moment: this.toMoment(row), price: row.price, balanceAfter: ctx.wallet.cash, cloutGained: 0, queueAhead: 0, replayed: true };
  }
}
