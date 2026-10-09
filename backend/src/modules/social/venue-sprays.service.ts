import { Injectable } from '@nestjs/common';
import {
  MINUTES_PER_HOUR,
  NAIRA_ABUSE,
  SPRAY_VENUE_TYPES,
  findVenue,
  formatNaira,
  isVenueOpen,
  nairaAbuseCrossings,
  nairaAbuseFine,
  sprayClout,
  sprayNightIndex,
  sprayNotes,
  toDateParts,
  type PlayerCardDto,
  type VenueSprayRequest,
  type VenueSprayResultDto,
} from '@insidelife/shared';
import { DomainException, ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import { CharacterEntity } from '../characters/entities/character.entity.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { PresenceService } from '../presence/presence.service.js';
import { RealtimeBus } from '../realtime-bus/realtime-bus.service.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { VenueSprayEntity } from './entities/venue-spray.entity.js';
import { EFCC_LINES } from './parties.service.js';
import { PlayerCardsService } from './player-cards.service.js';
import { checkVenueSpray } from './rules/venue-spray.rules.js';
import { addMood, adjustStatus } from './social-effects.js';
import { assertRule, normaliseHandle, playerNotFound } from './social-errors.js';
import { SocialGuard } from './social-guard.service.js';
import { SocialNotifier } from './social-notifier.service.js';

/** Players near the DJ booth who see the money rain. */
const RAIN_AUDIENCE = 60;

/**
 * Spraying in clubs and bars without a party: at someone in the room (a ledger transfer, unearned for them) or at the
 * DJ (the money leaves the game). Same notes, caps, clout and EFCC naira-abuse risk as owambe spraying, counted per
 * place per night (06:00-06:00). Everyone in the room sees the money rain.
 */
@Injectable()
export class VenueSpraysService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly bus: RealtimeBus,
    private readonly presence: PresenceService,
    private readonly cards: PlayerCardsService,
    private readonly guard: SocialGuard,
    private readonly notifier: SocialNotifier,
  ) {}

  async spray(ctx: SimulationContext, venueId: string, request: VenueSprayRequest): Promise<VenueSprayResultDto> {
    const sender = ctx.character;
    const previous = await ctx.manager.findOne(VenueSprayEntity, { where: { fromId: sender.id, idempotencyKey: request.idempotencyKey } });
    if (previous) return this.replayed(ctx, previous);

    const venue = findVenue(venueId);
    if (!venue || venue.regionId) throw new ResourceNotFoundException('Venue');
    const recipient = request.toHandle
      ? await ctx.manager.findOne(CharacterEntity, { where: { handle: normaliseHandle(request.toHandle), alive: true } })
      : null;
    if (request.toHandle && !recipient) throw playerNotFound();

    const night = sprayNightIndex(ctx.time);
    const before = await this.nightTotal(ctx, venueId, night);
    assertRule(
      checkVenueSpray({
        amount: request.amount,
        senderId: sender.id,
        recipientId: recipient?.id ?? null,
        sprayable: (SPRAY_VENUE_TYPES as readonly string[]).includes(venue.type),
        open: isVenueOpen(venue, toDateParts(ctx.time).hour),
        senderHere: sender.locationId === venueId,
        recipientHere: recipient !== null && recipient.locationId === venueId,
        blocked: recipient !== null && (await this.guard.isBlocked(sender.id, recipient.id, ctx.manager)),
        nightTotal: before,
        senderCash: ctx.wallet.cash,
      }),
    );

    const amount = request.amount;
    const notes = sprayNotes(amount);
    let transactionId: string | null = null;
    let cash = ctx.wallet.cash - amount;
    if (recipient) {
      // Same lock order and unearned bookkeeping as owambe spraying.
      await ctx.manager.query(`UPDATE characters SET unearned_total = unearned_total + $1, net_worth = net_worth + $1 WHERE id = $2`, [amount, recipient.id]);
      const recipientAccounts = await this.ledger.characterAccounts(ctx.manager, recipient.id);
      const posting = await this.ledger.post(ctx.manager, {
        kind: 'gift',
        memo: `Sprayed @${recipient.handle} at ${venue.name}`,
        idempotencyKey: `${sender.id}:venue-spray:${request.idempotencyKey}`,
        gameMinute: ctx.time,
        characterId: sender.id,
        counterpartyCharacterId: recipient.id,
        metadata: { venueId, thousands: notes.thousands, fiveHundreds: notes.fiveHundreds },
        legs: [
          { accountId: ctx.wallet.accounts.cash, amount: -amount },
          { accountId: recipientAccounts.cash, amount },
        ],
      });
      if (!posting.applied) throw new DomainException('SPRAY_DUPLICATE', 'That spray already went through');
      transactionId = posting.transactionId;
      cash = posting.balances.get(ctx.wallet.accounts.cash) ?? cash;
    } else {
      // The DJ is not a player: the notes leave the game.
      await ctx.wallet.pay(amount, 'gift', `Sprayed the DJ at ${venue.name}`, `venue-spray:${request.idempotencyKey}`, {
        metadata: { venueId, thousands: notes.thousands, fiveHundreds: notes.fiveHundreds },
      });
      cash = ctx.wallet.cash;
    }

    const spray = await ctx.manager.save(
      ctx.manager.create(VenueSprayEntity, {
        venueId,
        night,
        fromId: sender.id,
        toId: recipient?.id ?? null,
        amount,
        gameMinute: ctx.time,
        idempotencyKey: request.idempotencyKey,
        ledgerTransactionId: transactionId,
        fine: 0,
      }),
    );

    const after = before + amount;
    const cloutGained = sprayClout(before, after);
    adjustStatus(ctx, cloutGained);

    let efccMessage: string | null = null;
    for (const offence of nairaAbuseCrossings(before, after)) {
      const rng = ctx.rng('naira-abuse', venueId, night, offence);
      if (!rng.chance(NAIRA_ABUSE.chance)) continue;
      const line = rng.pick(EFCC_LINES);
      const fine = Math.min(cash, nairaAbuseFine(after));
      if (fine > 0) {
        // Capped at the cash actually left after the spray, so the debit can never fail the whole spray.
        await ctx.wallet.pay(fine, 'fine', `EFCC: naira abuse at ${venue.name}`, `naira-abuse:${venueId}:${night}:${sender.id}:${offence}`, { metadata: { venueId } });
        cash -= fine;
        spray.fine += fine;
      } else {
        addMood(ctx, 'efcc-wahala', 'EFCC wahala', -10, 24 * MINUTES_PER_HOUR);
      }
      efccMessage = fine > 0 ? `${line} Fine: ${formatNaira(fine)}.` : `${line} You had nothing left to pay, so they seized your phone “for investigation”.`;
      ctx.notify({ kind: 'social', title: 'EFCC: naira abuse!', body: efccMessage, tone: 'bad', amount: fine > 0 ? -fine : undefined });
    }
    if (spray.fine > 0) await ctx.manager.save(spray);

    if (recipient) {
      await this.notifier.notify(
        ctx,
        recipient.id,
        { kind: 'money-received', title: `💸 @${sender.handle} sprayed you ${formatNaira(amount)}`, body: `At ${venue.name}. Pick it up before the DJ does.`, tone: 'good', amount },
        'venue-spray',
      );
    }
    this.rain(ctx, venueId, sender.handle, recipient?.handle ?? 'DJ', amount);

    return {
      sprayId: spray.id,
      amount,
      notes,
      to: recipient ? await this.card(ctx, recipient) : null,
      balanceAfter: cash,
      yourNightTotal: after,
      cloutGained,
      nairaAbuse: efccMessage ? { fined: spray.fine > 0, fine: spray.fine, message: efccMessage } : null,
    };
  }

  /** Money rain for everyone in the room (they may not have the venue chat open, so push to each of them). */
  private rain(ctx: SimulationContext, venueId: string, fromHandle: string, toHandle: string, amount: number): void {
    const senderId = ctx.character.id;
    ctx.afterCommit(() => {
      void this.presence.playersAt(venueId, RAIN_AUDIENCE).then((players) => {
        const ids = new Set([senderId, ...players.map((player) => player.characterId)]);
        for (const id of ids) this.bus.toCharacter(id, 'party:spray', { venueId, fromHandle, toHandle, amount });
      });
    });
  }

  private async nightTotal(ctx: SimulationContext, venueId: string, night: number): Promise<number> {
    const rows: Array<{ total: string | null }> = await ctx.manager.query(
      `SELECT SUM(amount) AS total FROM social_venue_sprays WHERE venue_id = $1 AND night = $2 AND from_id = $3`,
      [venueId, night, ctx.character.id],
    );
    return Number(rows[0]?.total ?? 0);
  }

  private async card(ctx: SimulationContext, character: Pick<CharacterEntity, 'id' | 'handle' | 'firstName' | 'lastName' | 'status'>): Promise<PlayerCardDto> {
    return (
      (await this.cards.card(character.id, ctx.manager)) ??
      this.cards.toCard({ id: character.id, handle: character.handle, first_name: character.firstName, last_name: character.lastName, status: character.status, title: null }, false)
    );
  }

  private async replayed(ctx: SimulationContext, spray: VenueSprayEntity): Promise<VenueSprayResultDto> {
    const to = spray.toId ? await ctx.manager.findOneBy(CharacterEntity, { id: spray.toId }) : null;
    return {
      sprayId: spray.id,
      amount: spray.amount,
      notes: sprayNotes(spray.amount),
      to: to ? await this.card(ctx, to) : null,
      balanceAfter: ctx.wallet.cash,
      yourNightTotal: await this.nightTotal(ctx, spray.venueId, spray.night),
      cloutGained: 0,
      nairaAbuse: null,
      replayed: true,
    };
  }
}
