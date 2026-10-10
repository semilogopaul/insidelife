import { Inject, Injectable } from '@nestjs/common';
import { PROGRESSION_SIGNALS_PORT, type ProgressionSignalsPort } from '../../common/ports/progression.port.js';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, IsNull, MoreThanOrEqual, type DataSource, type EntityManager } from 'typeorm';
import {
  MINUTES_PER_HOUR,
  NAIRA_ABUSE,
  PARTY_DRESS_CODE_LABELS,
  PARTY_RULES,
  PARTY_TIERS,
  SPRAY_RULES,
  findVenue,
  formatNaira,
  hostCloutFor,
  isHomeLocation,
  nairaAbuseCrossings,
  nairaAbuseFine,
  partyBaseCost,
  partyCapacity,
  sprayClout,
  sprayNotes,
  streetDistrict,
  type CreatePartyRequest,
  type CreatePartyResultDto,
  type PartyCostDto,
  type PartyDetailDto,
  type PartyDto,
  type PartyQuoteDto,
  type PartyQuoteRequest,
  type PartySprayerDto,
  type PartyTierId,
  type PartyVenueKind,
  type PlayerCardDto,
  type SprayRequest,
  type SprayResultDto,
} from '@insidelife/shared';
import { DomainException, ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import { CharacterEntity } from '../characters/entities/character.entity.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { RealtimeBus } from '../realtime-bus/realtime-bus.service.js';
import { PeerMoneyGuard } from '../wallet/peer-money.guard.js';
import type { RowProbe } from '../simulation/row-presence.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { PartyGuestEntity } from './entities/party-guest.entity.js';
import { PartyEntity } from './entities/party.entity.js';
import { SprayEntity } from './entities/spray.entity.js';
import { FriendsService } from './friends.service.js';
import { PlayerCardsService } from './player-cards.service.js';
import {
  checkAttendance,
  checkHosting,
  checkSpray,
  isAtParty,
  partyPhase,
  partyRealtimeRoom,
  resolvePartyPlace,
  type PartyPlace,
} from './rules/party.rules.js';
import type { RuleResult } from './rules/rule-result.js';
import { returnedRows } from './sql-rows.js';
import { sanitisePlayerText } from './text-sanitiser.js';
import { addMood, adjustConnections, adjustStatus, boostNeeds } from './social-effects.js';
import { assertRule, normaliseHandle, playerNotFound, ruleException } from './social-errors.js';
import { SocialGuard } from './social-guard.service.js';
import { SocialNotifier } from './social-notifier.service.js';

/** Parties this character ever hosted: most never threw one, so the hosted-party reads are skipped (see `RowProbe`). */
export const HOSTED_PARTY_ROWS: RowProbe = { key: 'social:hosted-parties', table: 'social_parties', where: 'host_id = $1' };

const LIST_LIMIT = 30;
const GUEST_LIST_LIMIT = 60;
const TOP_SPRAYERS = 5;
/** Friends told about a new party (the rest find it in the list). */
const INVITE_FRIENDS_LIMIT = 50;
/** Hosts are pinged when a friend or a big name (this clout or more) walks in. */
const VIP_ARRIVAL_STATUS = 450;

export const EFCC_LINES: readonly string[] = [
  'EFCC operatives in agbada were at the owambe. Spraying naira is “abuse of the national currency”, they said.',
  'Your spraying video trended on X. EFCC tagged you before the DJ could play the next song.',
  'An officer collected an “administrative charge” and advised you to use transfers next time.',
  'The MC shouted your name one time too many. EFCC heard it from the gate.',
];

/**
 * Owambe parties: hosting (paid via the host's wallet), attendance (must be there while it's on), and spraying —
 * one balanced ledger posting from guest to guest inside the sprayer's `CharacterSession`, broadcast as money rain to
 * the venue room. Big sprays risk an EFCC naira-abuse fine (a satirical sink); hosts earn clout when the party ends.
 */
@Injectable()
export class PartiesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ledger: LedgerService,
    private readonly bus: RealtimeBus,
    private readonly cards: PlayerCardsService,
    private readonly friends: FriendsService,
    private readonly guard: SocialGuard,
    private readonly notifier: SocialNotifier,
    @Inject(PROGRESSION_SIGNALS_PORT) private readonly signals: ProgressionSignalsPort,
    private readonly peerMoney: PeerMoneyGuard,
  ) {}

  // ----- Hosting ------------------------------------------------------------------------------------------------

  async quote(ctx: SimulationContext, request: PartyQuoteRequest): Promise<PartyQuoteDto> {
    const place = this.place(ctx, request.venueId);
    const startsInMinutes = request.startsInMinutes ?? 0;
    const check = await this.hostingCheck(ctx, place, request.tier, request.durationHours, startsInMinutes);
    return {
      venueId: place.venueId,
      venueName: place.venueName,
      venueKind: place.venueKind,
      tier: request.tier,
      durationHours: request.durationHours,
      capacity: partyCapacity(place.venueKind, request.tier),
      cost: this.cost(ctx, place.venueKind, request.tier, request.durationHours),
      available: check.ok,
      reason: check.ok ? null : check.message,
    };
  }

  async create(ctx: SimulationContext, request: CreatePartyRequest): Promise<CreatePartyResultDto> {
    const host = ctx.character;
    const place = this.place(ctx, request.venueId);
    assertRule(await this.hostingCheck(ctx, place, request.tier, request.durationHours, request.startsInMinutes));

    const cost = this.cost(ctx, place.venueKind, request.tier, request.durationHours);
    const startsAt = ctx.time + request.startsInMinutes;
    const tier = PARTY_TIERS[request.tier];
    const id = randomUUID();
    await ctx.wallet.pay(cost.total, 'ceremony', `${tier.label} at ${place.venueName}`, `party:${id}`, {
      metadata: { partyId: id, venueId: place.venueId, tier: request.tier },
    });

    const party = await ctx.manager.save(
      ctx.manager.create(PartyEntity, {
        id,
        hostId: host.id,
        venueId: place.venueId,
        venueKind: place.venueKind,
        districtId: place.districtId,
        title: sanitisePlayerText(request.title, PARTY_RULES.titleMaxLength) || 'Owambe',
        tier: request.tier,
        dressCode: request.dressCode ?? tier.defaultDressCode,
        startsAt,
        endsAt: startsAt + request.durationHours * MINUTES_PER_HOUR,
        capacity: partyCapacity(place.venueKind, request.tier),
        costPaid: cost.total,
        status: 'scheduled',
        guestCount: 0,
        totalSprayed: 0,
        hostClout: 0,
      }),
    );

    for (const friendId of (await this.friends.friendIds(host.id, ctx.manager)).slice(0, INVITE_FRIENDS_LIMIT)) {
      await this.notifier.notify(
        ctx,
        friendId,
        {
          kind: 'social',
          title: `@${host.handle} is throwing a party 🎉`,
          body: `“${party.title}” — ${tier.label} at ${this.venueName(party, host.firstName)}. Dress code: ${PARTY_DRESS_CODE_LABELS[party.dressCode]}.`,
          tone: 'good',
        },
        'party-invite',
      );
    }
    ctx.notify({ kind: 'social', title: 'Party booked!', body: `“${party.title}” is on. Tell your people.`, tone: 'good', amount: -cost.total });
    await this.signals.record(ctx, 'owambe-hosted', cost.total);
    const [dto] = await this.toDtos(ctx.manager, [party], host.id, ctx.time);
    return { party: dto as PartyDto, cost };
  }

  async cancel(ctx: SimulationContext, partyId: string): Promise<PartyDto> {
    const party = await this.lockParty(ctx.manager, partyId);
    if (party.hostId !== ctx.character.id) throw ruleException('NOT_HOST', 'Only the host can cancel this party');
    if (partyPhase(party, ctx.time) !== 'upcoming') throw ruleException('PARTY_STARTED', 'Too late — the party has already started');
    party.status = 'cancelled';
    await ctx.manager.save(party);
    const refund = Math.round(party.costPaid * PARTY_RULES.cancelRefundRate);
    await ctx.wallet.receive(refund, 'refund', `Party cancelled: “${party.title}” (caterer kept half)`, `party-refund:${party.id}`, { income: 'neutral' });
    const [dto] = await this.toDtos(ctx.manager, [party], ctx.character.id, ctx.time);
    return dto as PartyDto;
  }

  // ----- Browsing -----------------------------------------------------------------------------------------------

  /** Live and upcoming parties: live first, then your district, then parties thrown by friends, then soonest. */
  async list(ctx: SimulationContext): Promise<PartyDto[]> {
    const viewer = ctx.character;
    const parties = await ctx.manager
      .createQueryBuilder(PartyEntity, 'party')
      .where('party.status = :status AND party.ends_at > :now AND party.starts_at <= :horizon', {
        status: 'scheduled',
        now: ctx.time,
        horizon: ctx.time + PARTY_RULES.listHorizonMinutes,
      })
      .andWhere(
        `NOT EXISTS (SELECT 1 FROM social_blocks b
                      WHERE (b.blocker_id = party.host_id AND b.blocked_id = :me) OR (b.blocker_id = :me AND b.blocked_id = party.host_id))`,
        { me: viewer.id },
      )
      .orderBy('party.starts_at', 'ASC')
      .limit(200)
      .getMany();
    const district = this.districtOf(viewer);
    const dtos = await this.toDtos(ctx.manager, parties, viewer.id, ctx.time);
    const score = (party: PartyDto): number =>
      (party.phase === 'live' ? 8 : 0) + (party.districtId === district ? 4 : 0) + (party.hostIsFriend || party.isHost ? 2 : 0) + (party.attending ? 1 : 0);
    return dtos.toSorted((a, b) => score(b) - score(a) || a.startsAt - b.startsAt).slice(0, LIST_LIMIT);
  }

  async detail(viewerId: string, partyId: string, now: number, manager: EntityManager = this.dataSource.manager): Promise<PartyDetailDto> {
    const party = await manager.findOne(PartyEntity, { where: { id: partyId } });
    if (!party || (party.hostId !== viewerId && (await this.guard.isBlocked(viewerId, party.hostId, manager)))) throw new ResourceNotFoundException('Party');
    const [dto] = await this.toDtos(manager, [party], viewerId, now);
    const guests = await manager.find(PartyGuestEntity, { where: { partyId }, order: { joinedAt: 'ASC' }, take: GUEST_LIST_LIMIT + 1 });
    const sprayers: Array<{ from_id: string; total: string }> = await manager.query(
      `SELECT from_id, SUM(amount) AS total FROM social_sprays WHERE party_id = $1 GROUP BY from_id ORDER BY total DESC LIMIT ${TOP_SPRAYERS}`,
      [partyId],
    );
    const guestIds = guests.map((guest) => guest.characterId).filter((id) => id !== party.hostId).slice(0, GUEST_LIST_LIMIT);
    const cards = await this.cards.cards([...guestIds, ...sprayers.map((row) => row.from_id)], manager);
    const topSprayers: PartySprayerDto[] = sprayers.flatMap((row) => {
      const player = cards.get(row.from_id);
      return player ? [{ player, amount: Number(row.total) }] : [];
    });
    return {
      ...(dto as PartyDto),
      guests: guestIds.map((id) => cards.get(id)).filter((card): card is PlayerCardDto => card !== undefined),
      topSprayers,
    };
  }

  // ----- Attending ----------------------------------------------------------------------------------------------

  /** Join a live party you're physically at: mood, social and fun boost, plus a bigger network. Idempotent. */
  async attend(ctx: SimulationContext, partyId: string): Promise<PartyDetailDto> {
    const guest = ctx.character;
    const party = await this.findParty(ctx.manager, partyId);
    const isHost = party.hostId === guest.id;
    const already = await ctx.manager.exists(PartyGuestEntity, { where: { partyId, characterId: guest.id } });
    if (already) return this.detail(guest.id, partyId, ctx.time, ctx.manager);

    const blocked = !isHost && (await this.guard.isBlocked(guest.id, party.hostId, ctx.manager));
    assertRule(
      checkAttendance({
        phase: partyPhase(party, ctx.time),
        startsAt: party.startsAt,
        atParty: isAtParty(party, guest.locationId),
        travelling: guest.travel !== null,
        blocked,
        full: party.guestCount >= party.capacity,
        isHost,
      }),
    );

    await ctx.manager.createQueryBuilder().insert().into(PartyGuestEntity).values({ partyId, characterId: guest.id, joinedAt: ctx.time }).orIgnore().execute();
    if (!isHost) {
      const updated = returnedRows<{ guest_count: number }>(
        await ctx.manager.query(`UPDATE social_parties SET guest_count = guest_count + 1 WHERE id = $1 AND guest_count < capacity RETURNING guest_count`, [
          partyId,
        ]),
      );
      if (updated.length === 0) throw ruleException('PARTY_FULL', 'The hall is full. Security has locked the gate.');
    }

    boostNeeds(ctx, { social: PARTY_RULES.socialBoost, fun: PARTY_RULES.funBoost });
    addMood(ctx, `owambe:${partyId}`, isHost ? 'Hosting an owambe' : 'Owambe vibes', PARTY_RULES.moodBoost, party.endsAt - ctx.time + PARTY_RULES.afterglowMinutes);
    if (!isHost) {
      const host = await ctx.manager.findOne(CharacterEntity, { where: { id: party.hostId }, select: { id: true, status: true } });
      adjustConnections(ctx, PARTY_RULES.connectionsGain + Math.min(2, (host?.status ?? 0) / 400));
      if (guest.status >= VIP_ARRIVAL_STATUS || (await this.guard.areFriends(guest.id, party.hostId, ctx.manager))) {
        await this.notifier.notify(
          ctx,
          party.hostId,
          { kind: 'social', title: 'Your guest has arrived', body: `@${guest.handle} just walked into “${party.title}”. DJ, play their song!`, tone: 'good' },
          'party-guest',
        );
      }
    }
    await this.signals.record(ctx, 'owambe-attended');
    return this.detail(guest.id, partyId, ctx.time, ctx.manager);
  }

  // ----- Spraying -----------------------------------------------------------------------------------------------

  async spray(ctx: SimulationContext, partyId: string, request: SprayRequest): Promise<SprayResultDto> {
    const sender = ctx.character;
    const previous = await ctx.manager.findOne(SprayEntity, { where: { fromId: sender.id, idempotencyKey: request.idempotencyKey } });
    if (previous) return this.replayed(ctx, previous);

    const party = await this.findParty(ctx.manager, partyId);
    const recipient = await ctx.manager.findOne(CharacterEntity, { where: { handle: normaliseHandle(request.toHandle), alive: true, hiddenAt: IsNull() } });
    if (!recipient) throw playerNotFound();

    const amount = request.amount;
    this.peerMoney.assertNoDebt(ctx);
    // One at a time: these share the session's transaction connection (pg runs one query at a time).
    const senderJoined = await this.hasJoined(ctx.manager, party, sender.id);
    const recipientJoined = await this.hasJoined(ctx.manager, party, recipient.id);
    const blocked = await this.guard.isBlocked(sender.id, recipient.id, ctx.manager);
    const before = await this.sprayedBy(ctx.manager, party.id, sender.id);
    assertRule(
      checkSpray({
        amount,
        phase: partyPhase(party, ctx.time),
        senderId: sender.id,
        recipientId: recipient.id,
        senderAtParty: isAtParty(party, sender.locationId),
        senderJoined,
        recipientAtParty: isAtParty(party, recipient.locationId),
        recipientJoined,
        blocked,
        senderPartyTotal: before,
        senderCash: ctx.wallet.cash,
      }),
    );
    const notifyRecipient = !(await ctx.manager.exists(SprayEntity, {
      where: { partyId: party.id, fromId: sender.id, toId: recipient.id, gameMinute: MoreThanOrEqual(ctx.time - SPRAY_RULES.notifyWindowMinutes) },
    }));

    // Sprays are player-to-player money: tier limit, starting money and the recipient's daily cap apply.
    await this.peerMoney.authorize(ctx, { id: recipient.id, handle: recipient.handle }, amount);
    // Lock order matches CharacterSession (character row, then ledger accounts) to keep deadlocks rare.
    // Sprayed money is unearned for the recipient: it never counts toward their self-made net worth.
    await ctx.manager.query(`UPDATE characters SET unearned_total = unearned_total + $1, net_worth = net_worth + $1 WHERE id = $2`, [amount, recipient.id]);
    const recipientAccounts = await this.ledger.characterAccounts(ctx.manager, recipient.id);
    const notes = sprayNotes(amount);
    const posting = await this.ledger.post(ctx.manager, {
      kind: 'gift',
      memo: `Sprayed @${recipient.handle} at “${party.title}”`,
      idempotencyKey: `${sender.id}:spray:${request.idempotencyKey}`,
      gameMinute: ctx.time,
      characterId: sender.id,
      counterpartyCharacterId: recipient.id,
      metadata: { partyId: party.id, thousands: notes.thousands, fiveHundreds: notes.fiveHundreds },
      legs: [
        { accountId: ctx.wallet.accounts.cash, amount: -amount },
        { accountId: recipientAccounts.cash, amount },
      ],
    });
    if (!posting.applied) throw new DomainException('SPRAY_DUPLICATE', 'That spray already went through');
    let cash = posting.balances.get(ctx.wallet.accounts.cash) ?? ctx.wallet.cash - amount;

    const spray = await ctx.manager.save(
      ctx.manager.create(SprayEntity, {
        partyId: party.id,
        fromId: sender.id,
        toId: recipient.id,
        amount,
        gameMinute: ctx.time,
        idempotencyKey: request.idempotencyKey,
        ledgerTransactionId: posting.transactionId,
        fine: 0,
      }),
    );
    await ctx.manager.query(`UPDATE social_parties SET total_sprayed = total_sprayed + $1 WHERE id = $2`, [amount, party.id]);

    const after = before + amount;
    const cloutGained = sprayClout(before, after);
    adjustStatus(ctx, cloutGained);

    // EFCC naira-abuse risk: one deterministic roll per ₦500k threshold crossed at this party.
    let efccMessage: string | null = null;
    for (const offence of nairaAbuseCrossings(before, after)) {
      const rng = ctx.rng('naira-abuse', party.id, offence);
      if (!rng.chance(NAIRA_ABUSE.chance)) continue;
      const line = rng.pick(EFCC_LINES);
      const fine = Math.min(cash, nairaAbuseFine(after));
      if (fine > 0) {
        // Capped at the cash actually left after the spray, so the debit can never fail the whole spray.
        await ctx.wallet.pay(fine, 'fine', 'EFCC: naira abuse at an owambe', `naira-abuse:${party.id}:${offence}`, { metadata: { partyId: party.id } });
        cash -= fine;
        spray.fine += fine;
      } else {
        addMood(ctx, 'efcc-wahala', 'EFCC wahala', -10, 24 * MINUTES_PER_HOUR);
      }
      efccMessage = fine > 0 ? `${line} Fine: ${formatNaira(fine)}.` : `${line} You had nothing left to pay, so they seized your phone “for investigation”.`;
      ctx.notify({ kind: 'social', title: 'EFCC: naira abuse!', body: efccMessage, tone: 'bad', amount: fine > 0 ? -fine : undefined });
    }
    const nairaAbuse: SprayResultDto['nairaAbuse'] = efccMessage ? { fined: spray.fine > 0, fine: spray.fine, message: efccMessage } : null;
    if (spray.fine > 0) await ctx.manager.save(spray);

    if (notifyRecipient) {
      await this.notifier.notify(
        ctx,
        recipient.id,
        {
          kind: 'money-received',
          title: 'You’re being sprayed! 💸',
          body: `@${sender.handle} is spraying you at “${party.title}”. Keep dancing — the notes are still falling.`,
          tone: 'good',
          amount,
        },
        'spray',
      );
    } else {
      this.notifier.invalidate(ctx, recipient.id, 'spray');
    }
    const room = partyRealtimeRoom(party);
    ctx.afterCommit(() => this.bus.toRoom(room, 'party:spray', { venueId: party.venueId, fromHandle: sender.handle, toHandle: recipient.handle, amount }));
    await this.signals.record(ctx, 'owambe-sprayed', amount);

    const to = await this.cards.card(recipient.id, ctx.manager);
    return {
      sprayId: spray.id,
      amount,
      notes,
      to: to ?? this.fallbackCard(recipient),
      balanceAfter: cash,
      yourPartyTotal: after,
      cloutGained,
      nairaAbuse,
      replayed: false,
    };
  }

  // ----- Simulation hooks (host's session) ----------------------------------------------------------------------

  /** Close the host's parties that have ended: award clout for turnout and money rain. */
  async finalizeHosted(ctx: SimulationContext): Promise<void> {
    const host = ctx.character;
    if (!(await ctx.mayHaveRows(HOSTED_PARTY_ROWS))) return;
    const ended = await ctx.manager
      .createQueryBuilder(PartyEntity, 'party')
      .setLock('pessimistic_write')
      .where('party.host_id = :id AND party.status = :status AND party.ends_at <= :now', { id: host.id, status: 'scheduled', now: ctx.time })
      .getMany();
    for (const party of ended) {
      const clout = hostCloutFor(party.tier, party.guestCount, party.totalSprayed);
      party.status = 'ended';
      party.hostClout = clout;
      await ctx.manager.save(party);
      if (clout > 0) {
        adjustStatus(ctx, clout);
        adjustConnections(ctx, Math.min(5, party.guestCount / 10));
        ctx.notify({
          kind: 'social',
          title: 'Lagos is talking about your party',
          body: `“${party.title}” pulled ${party.guestCount} guest${party.guestCount === 1 ? '' : 's'} and ${formatNaira(party.totalSprayed)} in sprays. +${clout} clout.`,
          tone: 'good',
        });
        ctx.report({ label: `Hosted “${party.title}” (+${clout} clout)`, tone: 'good' });
      } else {
        ctx.notify({
          kind: 'social',
          title: 'Nobody came…',
          body: `Only you, the DJ and three coolers of jollof showed up to “${party.title}”. Send invites earlier next time.`,
          tone: 'bad',
        });
        ctx.report({ label: `Nobody came to “${party.title}”`, tone: 'bad' });
      }
    }
  }

  /** The host died: upcoming parties are called off (the estate doesn't get a refund). */
  async cancelHosted(ctx: SimulationContext): Promise<void> {
    await ctx.manager
      .createQueryBuilder()
      .update(PartyEntity)
      .set({ status: 'cancelled' })
      .where('host_id = :id AND status = :status AND starts_at > :now', { id: ctx.character.id, status: 'scheduled', now: ctx.time })
      .execute();
  }

  // ----- Helpers ------------------------------------------------------------------------------------------------

  private place(ctx: SimulationContext, venueId: string): PartyPlace {
    const place = resolvePartyPlace(venueId, ctx.character.id, ctx.character.homeDistrictId);
    if (!place) throw ruleException('NOT_A_PARTY_VENUE', 'Parties happen at home, a bar, a club or an event centre');
    return place;
  }

  private async hostingCheck(ctx: SimulationContext, place: PartyPlace, tier: PartyTierId, durationHours: number, startsInMinutes: number): Promise<RuleResult> {
    const startsAt = ctx.time + startsInMinutes;
    const endsAt = startsAt + durationHours * MINUTES_PER_HOUR;
    const upcoming = await ctx.manager
      .createQueryBuilder(PartyEntity, 'party')
      .where('party.host_id = :id AND party.status = :status AND party.ends_at > :now', { id: ctx.character.id, status: 'scheduled', now: ctx.time })
      .getMany();
    return checkHosting({
      place,
      tier,
      durationHours,
      startsInMinutes,
      startsAt,
      endsAt,
      hostAge: ctx.age,
      hostStatus: ctx.character.status,
      upcomingHosted: upcoming.length,
      overlapsAnotherParty: upcoming.some((party) => startsAt < party.endsAt && endsAt > party.startsAt),
    });
  }

  private cost(ctx: SimulationContext, kind: PartyVenueKind, tier: PartyTierId, durationHours: number): PartyCostDto {
    const base = partyBaseCost(kind, tier, durationHours);
    const venueHire = ctx.world.price(base.venueHire, ctx.time);
    const setup = ctx.world.price(base.setup, ctx.time);
    const catering = ctx.world.price(base.catering, ctx.time);
    return { venueHire, setup, catering, total: venueHire + setup + catering };
  }

  private async findParty(manager: EntityManager, partyId: string): Promise<PartyEntity> {
    const party = await manager.findOne(PartyEntity, { where: { id: partyId } });
    if (!party) throw new ResourceNotFoundException('Party');
    return party;
  }

  private async lockParty(manager: EntityManager, partyId: string): Promise<PartyEntity> {
    const party = await manager.findOne(PartyEntity, { where: { id: partyId }, lock: { mode: 'pessimistic_write' } });
    if (!party) throw new ResourceNotFoundException('Party');
    return party;
  }

  private async hasJoined(manager: EntityManager, party: PartyEntity, characterId: string): Promise<boolean> {
    return party.hostId === characterId || manager.exists(PartyGuestEntity, { where: { partyId: party.id, characterId } });
  }

  private async sprayedBy(manager: EntityManager, partyId: string, characterId: string): Promise<number> {
    const rows: Array<{ total: string | null }> = await manager.query(`SELECT SUM(amount) AS total FROM social_sprays WHERE party_id = $1 AND from_id = $2`, [
      partyId,
      characterId,
    ]);
    return Number(rows[0]?.total ?? 0);
  }

  private async replayed(ctx: SimulationContext, spray: SprayEntity): Promise<SprayResultDto> {
    const to = (await this.cards.card(spray.toId, ctx.manager)) ?? this.fallbackCard(await ctx.manager.findOneByOrFail(CharacterEntity, { id: spray.toId }));
    return {
      sprayId: spray.id,
      amount: spray.amount,
      notes: sprayNotes(spray.amount),
      to,
      balanceAfter: ctx.wallet.cash,
      yourPartyTotal: await this.sprayedBy(ctx.manager, spray.partyId, ctx.character.id),
      cloutGained: 0,
      nairaAbuse: null,
      replayed: true,
    };
  }

  private fallbackCard(character: CharacterEntity): PlayerCardDto {
    return this.cards.toCard(
      { id: character.id, handle: character.handle, first_name: character.firstName, last_name: character.lastName, status: character.status, title: null },
      false,
    );
  }

  private districtOf(character: CharacterEntity): string {
    const street = streetDistrict(character.locationId);
    if (street) return street;
    if (isHomeLocation(character.locationId)) return character.homeDistrictId;
    return findVenue(character.locationId)?.districtId ?? character.homeDistrictId;
  }

  private venueName(party: Pick<PartyEntity, 'venueKind' | 'venueId'>, hostFirstName: string): string {
    return party.venueKind === 'home' ? `${hostFirstName}’s place (street owambe)` : (findVenue(party.venueId)?.name ?? 'Somewhere in Lagos');
  }

  private async toDtos(manager: EntityManager, parties: readonly PartyEntity[], viewerId: string, now: number): Promise<PartyDto[]> {
    if (parties.length === 0) return [];
    // One at a time: these share the session's transaction connection (pg runs one query at a time).
    const hosts = await this.cards.cards(parties.map((party) => party.hostId), manager);
    const joined = await manager.find(PartyGuestEntity, { where: { characterId: viewerId, partyId: In(parties.map((party) => party.id)) }, select: { partyId: true } });
    const friendIds = await this.friends.friendIds(viewerId, manager);
    const attending = new Set(joined.map((row) => row.partyId));
    const friends = new Set(friendIds);
    return parties.flatMap((party) => {
      const host = hosts.get(party.hostId);
      if (!host) return [];
      const isHost = party.hostId === viewerId;
      return [
        {
          id: party.id,
          title: party.title,
          tier: party.tier,
          tierLabel: PARTY_TIERS[party.tier].label,
          dressCode: party.dressCode,
          dressCodeLabel: PARTY_DRESS_CODE_LABELS[party.dressCode],
          venueId: party.venueId,
          venueName: this.venueName(party, host.firstName),
          venueKind: party.venueKind,
          districtId: party.districtId,
          host,
          startsAt: party.startsAt,
          endsAt: party.endsAt,
          phase: partyPhase(party, now),
          guestCount: party.guestCount,
          capacity: party.capacity,
          totalSprayed: party.totalSprayed,
          costPaid: isHost ? party.costPaid : null,
          attending: attending.has(party.id),
          isHost,
          hostIsFriend: friends.has(party.hostId),
          realtimeRoom: partyRealtimeRoom(party),
        },
      ];
    });
  }
}
