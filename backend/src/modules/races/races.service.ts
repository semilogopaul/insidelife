import { Inject, Injectable } from '@nestjs/common';
import {
  AIRLINES,
  CITIES,
  RACE_DURATION_DAYS,
  RACE_DURATION_MINUTES,
  RACE_HISTORY_LIMIT,
  RACE_HOW_LABELS,
  RACE_INVITE_MINUTES,
  RACE_MAX_RACERS,
  cityOfVenueId,
  findFlight,
  formatRaceTime,
  isInterruptibleActivity,
  otherCity,
  racePlaces,
  raceDecided,
  raceHowOf,
  type CityId,
  type CreateRaceRequest,
  type RaceDto,
  type RaceFriendDto,
  type RaceHow,
  type RaceRacerDto,
  type RaceResultDto,
  type RacesOverviewDto,
} from '@insidelife/shared';
import { GameRuleException, ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import { PROGRESSION_SIGNALS_PORT, type ProgressionSignalsPort } from '../../common/ports/progression.port.js';
import type { TravelState } from '../characters/entities/character.entity.js';
import { NotificationsService, type NotificationDraft } from '../notifications/notifications.service.js';
import { RealtimeBus } from '../realtime-bus/realtime-bus.service.js';
import type { RowProbe } from '../simulation/row-presence.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { RaceEntryEntity } from './entities/race-entry.entity.js';
import { RaceEntity } from './entities/race.entity.js';

/** Entries that can still change: an unanswered invitation or a racer who has not arrived (arrival hook, expiry sweep). */
export const RACE_LIVE_ROWS: RowProbe = { key: 'races:live', table: 'race_entries', where: `character_id = $1 AND status IN ('invited', 'accepted')` };
/** A win whose badge signal is still to be recorded in the winner's own session. */
export const RACE_UNCLAIMED_ROWS: RowProbe = { key: 'races:unclaimed', table: 'race_entries', where: 'character_id = $1 AND won AND NOT win_claimed' };

/** An expired race waits this long (game minutes) for racers whose trip lands inside the window but who have not settled yet. */
const SETTLE_GRACE_MINUTES = 24 * 60;

interface PersonRow {
  readonly id: string;
  readonly handle: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly city_id: CityId;
  readonly alive: boolean;
  readonly hidden_at: Date | null;
  readonly travel: TravelState | null;
}

/** Races between friends: "Race a friend to Abuja" (and back). Everything here runs in a player's own session. */
@Injectable()
export class RacesService {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly bus: RealtimeBus,
    @Inject(PROGRESSION_SIGNALS_PORT) private readonly signals: ProgressionSignalsPort,
  ) {}

  // ----- Reads -----------------------------------------------------------------------------------------------------

  async overview(ctx: SimulationContext): Promise<RacesOverviewDto> {
    await this.sweep(ctx);
    const me = ctx.character.id;
    const rows: Array<{ race_id: string; entry_status: string }> = await ctx.manager.query(
      `SELECT e.race_id, e.status AS entry_status
         FROM race_entries e JOIN races r ON r.id = e.race_id
        WHERE e.character_id = $1 AND e.status <> 'declined' AND r.status <> 'cancelled'
        ORDER BY COALESCE(r.started_at, r.created_at_minute) DESC, r.id`,
      [me],
    );
    const byRace = new Map(rows.map((row) => [row.race_id, row.entry_status]));
    const dtos = await this.dtos(ctx, [...byRace.keys()]);
    const active = dtos.find((race) => byRace.get(race.id) === 'accepted' && (race.status === 'pending' || race.status === 'running')) ?? null;
    const invitations = dtos.filter((race) => byRace.get(race.id) === 'invited' && race.status === 'pending');
    const recent = dtos
      .filter((race) => race !== active && byRace.get(race.id) !== 'invited' && race.startedAt !== null)
      .slice(0, RACE_HISTORY_LIMIT);
    const blocker = await this.challengeBlocker(ctx);
    return {
      active,
      invitations,
      recent,
      friends: await this.friends(ctx),
      canChallenge: blocker === null,
      blocker,
      cityId: ctx.character.cityId,
      toCity: otherCity(ctx.character.cityId),
      maxRacers: RACE_MAX_RACERS,
      durationDays: RACE_DURATION_DAYS,
    };
  }

  async result(ctx: SimulationContext, raceId: string): Promise<RaceResultDto> {
    const race = (await this.dtos(ctx, [raceId]))[0];
    if (!race) throw new ResourceNotFoundException('Race');
    return { race, overview: await this.overview(ctx) };
  }

  // ----- Commands --------------------------------------------------------------------------------------------------

  /** Challenge one to three friends in your city to race to the other city. */
  async create(ctx: SimulationContext, request: CreateRaceRequest): Promise<RaceResultDto> {
    const character = ctx.character;
    if (!character.alive) throw new GameRuleException('DECEASED', 'This character has passed on');
    await this.sweep(ctx);
    const blocker = await this.challengeBlocker(ctx);
    if (blocker) throw new GameRuleException('CANNOT_CHALLENGE', blocker);
    const friendIds = [...new Set(request.friendIds)];
    if (friendIds.length === 0) throw new GameRuleException('NO_RACERS', 'Pick at least one friend to race');
    if (friendIds.includes(character.id)) throw new GameRuleException('NO_RACERS', 'You can’t race yourself');
    if (friendIds.length + 1 > RACE_MAX_RACERS) throw new GameRuleException('TOO_MANY_RACERS', `A race has ${RACE_MAX_RACERS} racers at most, you included`);

    const friends = new Map((await this.friends(ctx)).map((friend) => [friend.characterId, friend]));
    for (const id of friendIds) {
      const friend = friends.get(id);
      if (!friend) throw new GameRuleException('NOT_A_FRIEND', 'You can only race your friends');
      if (!friend.available) throw new GameRuleException('FRIEND_UNAVAILABLE', `${friend.name}: ${friend.reason ?? 'not available'}`);
    }

    const race = await ctx.manager.save(
      ctx.manager.create(RaceEntity, {
        challengerId: character.id,
        fromCity: character.cityId,
        toCity: otherCity(character.cityId),
        status: 'pending',
        createdAtMinute: ctx.time,
        startedAt: null,
        expiresAt: ctx.time + RACE_INVITE_MINUTES,
        decidedAt: null,
      }),
    );
    const entries = [character.id, ...friendIds].map((characterId) =>
      ctx.manager.create(RaceEntryEntity, { raceId: race.id, characterId, status: characterId === character.id ? 'accepted' : 'invited', finishedAt: null, how: null, howLabel: null, won: false, winClaimed: false }),
    );
    await ctx.manager.save(entries);

    const destination = CITIES[race.toCity].name;
    for (const id of friendIds) {
      await this.notifyOther(ctx, id, {
        kind: 'travel',
        title: `Race to ${destination}?`,
        body: `${character.firstName} challenged you to a race from ${CITIES[race.fromCity].name} to ${destination}. First one there wins. Open the Flights app to answer.`,
        tone: 'neutral',
      });
    }
    return this.result(ctx, race.id);
  }

  /** Say yes. The clock starts when the last friend does; everyone has to be in the starting city then. */
  async accept(ctx: SimulationContext, raceId: string): Promise<RaceResultDto> {
    await this.sweep(ctx);
    const race = await this.lockRace(ctx, raceId);
    const entry = race ? await this.entryOf(ctx, race.id, ctx.character.id) : null;
    if (!race || !entry || entry.status === 'declined') throw new ResourceNotFoundException('Race');
    if (entry.status !== 'invited') return this.result(ctx, race.id);
    if (race.status !== 'pending') throw new GameRuleException('RACE_CLOSED', race.status === 'running' ? 'That race has already started' : 'That race is over');
    if (await this.busyElsewhere(ctx, race.id)) throw new GameRuleException('ALREADY_RACING', 'You’re already in a race. Finish it first');
    const character = ctx.character;
    if (character.travel) throw new GameRuleException('TRAVELLING', 'You’re on the move. Accept when you’ve arrived');
    if (character.cityId !== race.fromCity) throw new GameRuleException('WRONG_CITY', `The race starts in ${CITIES[race.fromCity].name}. Be there to accept`);

    entry.status = 'accepted';
    await ctx.manager.save(entry);
    const entries = (await this.entries(ctx, race.id)).filter((e) => e.status !== 'declined');
    if (entries.every((e) => e.status === 'accepted')) await this.start(ctx, race, entries, true);
    else {
      await this.notifyOther(ctx, race.challengerId, {
        kind: 'travel',
        title: 'Race: a friend is in',
        body: `${character.firstName} accepted. Waiting for ${entries.filter((e) => e.status === 'invited').length} more.`,
        tone: 'good',
      });
    }
    return this.result(ctx, race.id);
  }

  /** Say no (or pull out before the start). Fewer than two racers left cancels the race. */
  async decline(ctx: SimulationContext, raceId: string): Promise<RaceResultDto> {
    const race = await this.lockRace(ctx, raceId);
    const entry = race ? await this.entryOf(ctx, race.id, ctx.character.id) : null;
    if (!race || !entry) throw new ResourceNotFoundException('Race');
    if (entry.status === 'declined') return this.result(ctx, race.id);
    if (race.status !== 'pending') throw new GameRuleException('RACE_CLOSED', 'That race has already started or is over');
    if (race.challengerId === ctx.character.id) throw new GameRuleException('IS_CHALLENGER', 'You started this one. Call it off instead');
    entry.status = 'declined';
    await ctx.manager.save(entry);

    const entries = await this.entries(ctx, race.id);
    const remaining = entries.filter((e) => e.status !== 'declined');
    if (remaining.length < 2) {
      race.status = 'cancelled';
      await ctx.manager.save(race);
      await this.notifyAll(ctx, remaining, { kind: 'travel', title: 'Race called off', body: `${ctx.character.firstName} said no, so nobody’s left to race.`, tone: 'neutral' });
    } else {
      await this.notifyOther(ctx, race.challengerId, { kind: 'travel', title: 'Race: a friend said no', body: `${ctx.character.firstName} won’t race.`, tone: 'neutral' });
      if (remaining.every((e) => e.status === 'accepted')) await this.start(ctx, race, remaining, false);
    }
    return this.result(ctx, race.id);
  }

  /** The challenger calls off a race that has not started. */
  async cancel(ctx: SimulationContext, raceId: string): Promise<RaceResultDto> {
    const race = await this.lockRace(ctx, raceId);
    if (!race || race.challengerId !== ctx.character.id) throw new ResourceNotFoundException('Race');
    if (race.status === 'cancelled') return this.result(ctx, race.id);
    if (race.status !== 'pending') throw new GameRuleException('RACE_CLOSED', 'The clock has started. It ends by itself in a few days');
    race.status = 'cancelled';
    await ctx.manager.save(race);
    const entries = await this.entries(ctx, race.id);
    await this.notifyAll(ctx, entries.filter((e) => e.characterId !== ctx.character.id && e.status !== 'declined'), {
      kind: 'travel',
      title: 'Race called off',
      body: `${ctx.character.firstName} called off the race to ${CITIES[race.toCity].name}.`,
      tone: 'neutral',
    });
    return this.result(ctx, race.id);
  }

  // ----- The simulation hooks --------------------------------------------------------------------------------------

  /**
   * A trip ended: if it was a way between the cities and the racer is now in the destination city of a running race, they
   * have finished, at the trip's arrival minute (not "now": a racer who settles late still crossed the line on time).
   */
  async onArrival(ctx: SimulationContext, travel: TravelState): Promise<void> {
    if (!(await ctx.mayHaveRows(RACE_LIVE_ROWS))) return;
    const commercial = travel.mode === 'flight' && travel.flightId !== undefined && findFlight(ctx.world.seed, travel.flightId) !== null;
    const how = raceHowOf(travel.mode, commercial);
    if (!how) return;
    const mine = await ctx.manager.find(RaceEntryEntity, { where: { characterId: ctx.character.id, status: 'accepted' } });
    for (const mineEntry of mine) {
      const race = await this.lockRace(ctx, mineEntry.raceId);
      if (!race || race.status !== 'running' || race.startedAt === null) continue;
      if (race.toCity !== ctx.character.cityId || travel.arriveAt < race.startedAt || travel.arriveAt > race.expiresAt) continue;
      const entry = await this.entryOf(ctx, race.id, ctx.character.id);
      if (!entry || entry.status !== 'accepted') continue;
      entry.status = 'finished';
      entry.finishedAt = travel.arriveAt;
      entry.how = how;
      entry.howLabel = this.howLabel(ctx, how, travel);
      await ctx.manager.save(entry);
      await this.afterArrival(ctx, race);
    }
  }

  /** Every settle: lapse stale challenges, end races that ran out of time, and record the badge for wins decided elsewhere. */
  async onSettled(ctx: SimulationContext): Promise<void> {
    if (await ctx.mayHaveRows(RACE_LIVE_ROWS)) await this.sweep(ctx);
    await this.claimWins(ctx);
  }

  // ----- Starting, finishing ---------------------------------------------------------------------------------------

  /** Start the clock: everyone is in, and (unless `strict` is false and someone has wandered off) in the starting city. */
  private async start(ctx: SimulationContext, race: RaceEntity, entries: readonly RaceEntryEntity[], strict: boolean): Promise<void> {
    const people = await this.people(ctx, entries.map((entry) => entry.characterId));
    for (const entry of entries) {
      if (entry.characterId === ctx.character.id) continue;
      const person = people.get(entry.characterId);
      const reason = !person || !person.alive ? 'can’t race any more' : person.travel ? 'is on the move' : person.city_id !== race.fromCity ? `isn’t in ${CITIES[race.fromCity].name}` : null;
      if (reason === null) continue;
      if (strict) throw new GameRuleException('RACER_NOT_HERE', `${person?.first_name ?? 'A friend'} ${reason}. Everyone has to be in ${CITIES[race.fromCity].name} when the race starts`);
      return;
    }
    race.status = 'running';
    race.startedAt = ctx.time;
    race.expiresAt = ctx.time + RACE_DURATION_MINUTES;
    await ctx.manager.save(race);
    await this.notifyAll(ctx, entries, {
      kind: 'travel',
      title: `Race to ${CITIES[race.toCity].name}: go!`,
      body: `Everyone’s in. First to ${CITIES[race.toCity].name} wins: plane, flight or coach. You have ${RACE_DURATION_DAYS} days.`,
      tone: 'good',
    });
  }

  /** After a racer's arrival is recorded (race row locked): decide the winner, finish the race, announce, claim. */
  private async afterArrival(ctx: SimulationContext, race: RaceEntity): Promise<void> {
    const entries = await this.entries(ctx, race.id);
    const racers = entries.filter((entry) => entry.status !== 'declined');
    const finished = racers.filter((entry) => entry.finishedAt !== null);
    const everyoneIn = finished.length === racers.length;
    const wasDecided = race.decidedAt !== null;

    if (!wasDecided) {
      const waiting = racers.filter((entry) => entry.finishedAt === null).map((entry) => entry.characterId);
      const pending = await this.pendingArrivals(ctx, race, waiting);
      if (raceDecided(finished.map((entry) => entry.finishedAt as number), pending)) await this.decide(ctx, race, entries);
    }
    if (everyoneIn) {
      race.status = 'finished';
      await ctx.manager.save(race);
    }
    if (!wasDecided && race.decidedAt !== null) await this.announce(ctx, race, entries, everyoneIn ? 'results' : 'winner');
    else if (everyoneIn) await this.announce(ctx, race, entries, 'results');
    await this.claimWins(ctx);
  }

  /** Mark the first-place finisher(s) as winners (race row locked). */
  private async decide(ctx: SimulationContext, race: RaceEntity, entries: readonly RaceEntryEntity[]): Promise<void> {
    const finished = entries.filter((entry) => entry.finishedAt !== null);
    if (finished.length === 0 || race.decidedAt !== null) return;
    const best = Math.min(...finished.map((entry) => entry.finishedAt as number));
    for (const entry of finished) {
      if (entry.finishedAt === best) {
        entry.won = true;
        await ctx.manager.save(entry);
      }
    }
    race.decidedAt = ctx.time;
    await ctx.manager.save(race);
  }

  /** Landing minutes of racers' trips that are already under way towards the destination (read, never written). */
  private async pendingArrivals(ctx: SimulationContext, race: RaceEntity, characterIds: readonly string[]): Promise<number[]> {
    if (characterIds.length === 0) return [];
    const others = characterIds.filter((id) => id !== ctx.character.id);
    const people = await this.people(ctx, others);
    const arrivals: number[] = [];
    for (const person of people.values()) {
      const travel = person.travel;
      if (!travel || (travel.mode !== 'flight' && travel.mode !== 'coach')) continue;
      if (cityOfVenueId(travel.toLocationId) !== race.toCity) continue;
      if (race.startedAt !== null && travel.arriveAt < race.startedAt) continue;
      arrivals.push(travel.arriveAt);
    }
    return arrivals;
  }

  /** Lapse stale challenges and end running races whose time is up, for the races this player is in. */
  private async sweep(ctx: SimulationContext): Promise<void> {
    const due: Array<{ id: string }> = await ctx.manager.query(
      `SELECT r.id FROM races r JOIN race_entries e ON e.race_id = r.id
        WHERE e.character_id = $1 AND e.status <> 'declined' AND r.status IN ('pending', 'running') AND r.expires_at <= $2`,
      [ctx.character.id, ctx.time],
    );
    for (const { id } of due) {
      const race = await this.lockRace(ctx, id);
      if (!race || (race.status !== 'pending' && race.status !== 'running') || race.expiresAt > ctx.time) continue;
      const entries = await this.entries(ctx, race.id);
      const racers = entries.filter((entry) => entry.status !== 'declined');
      if (race.status === 'pending') {
        race.status = 'expired';
        await ctx.manager.save(race);
        await this.notifyAll(ctx, racers.filter((entry) => entry.characterId !== ctx.character.id), {
          kind: 'travel',
          title: 'Race challenge lapsed',
          body: `Nobody started the race to ${CITIES[race.toCity].name} in time.`,
          tone: 'neutral',
        });
        continue;
      }
      // Running out of time. Racers whose trip lands inside the window but who have not settled yet get a day's grace.
      const waiting = racers.filter((entry) => entry.finishedAt === null).map((entry) => entry.characterId);
      const late = (await this.pendingArrivals(ctx, race, waiting)).some((arrival) => arrival <= race.expiresAt);
      if (late && ctx.time < race.expiresAt + SETTLE_GRACE_MINUTES) continue;
      race.status = 'expired';
      await ctx.manager.save(race);
      const wasDecided = race.decidedAt !== null;
      if (!wasDecided) await this.decide(ctx, race, entries);
      // A winner already announced with nobody else arriving since needs no second message.
      const arrived = entries.filter((entry) => entry.finishedAt !== null).length;
      if (!wasDecided || arrived > entries.filter((entry) => entry.won).length) await this.announce(ctx, race, entries, 'ended');
    }
    await this.claimWins(ctx);
  }

  /** Record the winner's badge signal in their own session (once). */
  private async claimWins(ctx: SimulationContext): Promise<void> {
    if (!(await ctx.mayHaveRows(RACE_UNCLAIMED_ROWS))) return;
    const wins = await ctx.manager.find(RaceEntryEntity, { where: { characterId: ctx.character.id, won: true, winClaimed: false } });
    for (const win of wins) {
      // Same order as everywhere: the race row first, then the entry.
      await this.lockRace(ctx, win.raceId);
      await this.signals.record(ctx, 'race-won');
      win.winClaimed = true;
      await ctx.manager.save(win);
    }
  }

  // ----- Announcements ---------------------------------------------------------------------------------------------

  private async announce(ctx: SimulationContext, race: RaceEntity, entries: readonly RaceEntryEntity[], phase: 'winner' | 'results' | 'ended'): Promise<void> {
    const people = await this.people(ctx, entries.map((entry) => entry.characterId));
    const racers = entries.filter((entry) => entry.status !== 'declined');
    const places = racePlaces(racers.map((entry) => ({ id: entry.id, finishedAt: entry.finishedAt })));
    const nameOf = (entry: RaceEntryEntity): string => people.get(entry.characterId)?.first_name ?? 'A racer';
    const started = race.startedAt ?? race.createdAtMinute;
    const destination = CITIES[race.toCity].name;
    const ranked = racers
      .filter((entry) => entry.finishedAt !== null)
      .toSorted((a, b) => (a.finishedAt as number) - (b.finishedAt as number))
      .map((entry) => `${places.get(entry.id)}. ${nameOf(entry)} ${formatRaceTime((entry.finishedAt as number) - started)} (${entry.howLabel ?? '?'})`);
    const winners = racers.filter((entry) => entry.won);
    const winnerNames = winners.map(nameOf).join(' and ');

    for (const entry of racers) {
      const won = entry.won;
      let draft: Omit<NotificationDraft, 'gameMinute'>;
      if (winners.length === 0) {
        draft = { kind: 'travel', title: `Race to ${destination} is over`, body: 'Nobody made it in time.', tone: 'neutral' };
      } else if (phase === 'winner') {
        draft = won
          ? { kind: 'travel', title: `You won the race to ${destination}!`, body: `${ranked[0] ?? ''}. The others are still on the way.`, tone: 'good' }
          : { kind: 'travel', title: `${winnerNames} won the race to ${destination}`, body: entry.finishedAt === null ? 'You can still finish for a place.' : (ranked.join(' · ') || ''), tone: 'neutral' };
      } else {
        const place = places.get(entry.id);
        draft = {
          kind: 'travel',
          title: won ? `You won the race to ${destination}!` : place ? `Race to ${destination}: you came ${ordinal(place)}` : `Race to ${destination}: you didn’t make it`,
          body: ranked.join(' · '),
          tone: won ? 'good' : 'neutral',
        };
      }
      if (entry.characterId === ctx.character.id) ctx.notify(draft);
      else await this.notifyOther(ctx, entry.characterId, draft);
    }
  }

  private async notifyAll(ctx: SimulationContext, entries: readonly RaceEntryEntity[], draft: Omit<NotificationDraft, 'gameMinute'>): Promise<void> {
    for (const entry of entries) {
      if (entry.characterId === ctx.character.id) ctx.notify(draft);
      else await this.notifyOther(ctx, entry.characterId, draft);
    }
  }

  /** Notify another player: the row is written in this transaction, pushed (with a refetch nudge) after commit. */
  private async notifyOther(ctx: SimulationContext, recipientId: string, draft: Omit<NotificationDraft, 'gameMinute'>): Promise<void> {
    const created = await this.notifications.create(ctx.manager, recipientId, [{ ...draft, gameMinute: ctx.time }]);
    ctx.afterCommit(() => {
      this.notifications.push(
        recipientId,
        created.map((note) => ({ ...note, link: { app: 'flights', param: 'race', label: 'See the race' } })),
      );
      this.bus.toCharacter(recipientId, 'character:invalidate', { reason: 'race' });
    });
  }

  // ----- Rules and lookups -----------------------------------------------------------------------------------------

  /** Why this player can't start a race right now, or null. */
  private async challengeBlocker(ctx: SimulationContext): Promise<string | null> {
    const character = ctx.character;
    if (!character.alive) return 'This character has passed on';
    if (character.travel) return 'You’re on the move. Start a race from where you land';
    if (character.activity && !isInterruptibleActivity(character.activity)) return 'Finish what you’re doing first';
    if (await this.busyElsewhere(ctx, null)) return 'You’re already in a race. Finish it first';
    return null;
  }

  /** In another live race (accepted and not over), other than `exceptRaceId`. */
  private async busyElsewhere(ctx: SimulationContext, exceptRaceId: string | null): Promise<boolean> {
    const rows: unknown[] = await ctx.manager.query(
      `SELECT 1 FROM race_entries e JOIN races r ON r.id = e.race_id
        WHERE e.character_id = $1 AND e.status = 'accepted' AND r.status IN ('pending', 'running') AND ($2::uuid IS NULL OR r.id <> $2::uuid)
        LIMIT 1`,
      [ctx.character.id, exceptRaceId],
    );
    return rows.length > 0;
  }

  /** The player's friends with whether each can be challenged right now. */
  private async friends(ctx: SimulationContext): Promise<RaceFriendDto[]> {
    const me = ctx.character.id;
    const rows: Array<PersonRow & { blocked: boolean; racing: boolean }> = await ctx.manager.query(
      `SELECT c.id, c.handle, c.first_name, c.last_name, c.city_id, c.alive, c.hidden_at, c.travel,
              EXISTS (SELECT 1 FROM social_blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = c.id) OR (b.blocker_id = c.id AND b.blocked_id = $1)) AS blocked,
              EXISTS (SELECT 1 FROM race_entries e JOIN races r ON r.id = e.race_id
                       WHERE e.character_id = c.id AND e.status = 'accepted' AND r.status IN ('pending', 'running')) AS racing
         FROM social_friendships f
         JOIN characters c ON c.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
        WHERE f.status = 'accepted' AND (f.requester_id = $1 OR f.addressee_id = $1)
        ORDER BY c.first_name, c.handle
        LIMIT 200`,
      [me],
    );
    const here = ctx.character.cityId;
    return rows
      .filter((row) => row.alive && row.hidden_at === null && !row.blocked)
      .map((row) => {
        const travelling = row.travel !== null;
        const reason = travelling
          ? 'On the move'
          : row.city_id !== here
            ? `In ${CITIES[row.city_id].name}`
            : row.racing
              ? 'Already in a race'
              : null;
        return {
          characterId: row.id,
          handle: row.handle,
          name: `${row.first_name} ${row.last_name}`,
          cityId: travelling ? null : row.city_id,
          available: reason === null,
          reason,
        };
      });
  }

  private async people(ctx: SimulationContext, ids: readonly string[]): Promise<Map<string, PersonRow>> {
    if (ids.length === 0) return new Map();
    const rows: PersonRow[] = await ctx.manager.query(
      `SELECT id, handle, first_name, last_name, city_id, alive, hidden_at, travel FROM characters WHERE id = ANY($1::uuid[])`,
      [[...ids]],
    );
    return new Map(rows.map((row) => [row.id, row]));
  }

  private lockRace(ctx: SimulationContext, id: string): Promise<RaceEntity | null> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return Promise.resolve(null);
    return ctx.manager.findOne(RaceEntity, { where: { id }, lock: { mode: 'pessimistic_write' } });
  }

  private entries(ctx: SimulationContext, raceId: string): Promise<RaceEntryEntity[]> {
    return ctx.manager.find(RaceEntryEntity, { where: { raceId }, order: { createdAt: 'ASC', id: 'ASC' } });
  }

  private entryOf(ctx: SimulationContext, raceId: string, characterId: string): Promise<RaceEntryEntity | null> {
    return ctx.manager.findOne(RaceEntryEntity, { where: { raceId, characterId } });
  }

  private howLabel(ctx: SimulationContext, how: RaceHow, travel: TravelState): string {
    if (how === 'coach') return RACE_HOW_LABELS.coach;
    if (how === 'commercial') {
      const flight = travel.flightId ? findFlight(ctx.world.seed, travel.flightId) : null;
      return flight ? `${AIRLINES[flight.airlineId].name} ${flight.number}` : RACE_HOW_LABELS.commercial;
    }
    return (travel.flightId ?? RACE_HOW_LABELS.private).slice(0, 80);
  }

  // ----- DTOs ------------------------------------------------------------------------------------------------------

  private async dtos(ctx: SimulationContext, raceIds: readonly string[]): Promise<RaceDto[]> {
    if (raceIds.length === 0) return [];
    const races = await ctx.manager.find(RaceEntity, { where: raceIds.map((id) => ({ id })) });
    const entries = await ctx.manager
      .createQueryBuilder(RaceEntryEntity, 'e')
      .where('e.race_id IN (:...ids)', { ids: [...raceIds] })
      .orderBy('e.created_at', 'ASC')
      .addOrderBy('e.id', 'ASC')
      .getMany();
    const people = await this.people(ctx, [...new Set(entries.map((entry) => entry.characterId))]);
    const order = new Map(raceIds.map((id, index) => [id, index]));
    return races
      .map((race) => this.toDto(ctx, race, entries.filter((entry) => entry.raceId === race.id), people))
      .toSorted((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  private toDto(ctx: SimulationContext, race: RaceEntity, entries: readonly RaceEntryEntity[], people: ReadonlyMap<string, PersonRow>): RaceDto {
    const racers = entries.filter((entry) => entry.status !== 'declined');
    const places = racePlaces(racers.map((entry) => ({ id: entry.id, finishedAt: entry.finishedAt })));
    const dtos: RaceRacerDto[] = racers.map((entry) => {
      const person = people.get(entry.characterId);
      return {
        characterId: entry.characterId,
        handle: person?.handle ?? 'unknown',
        name: person ? `${person.first_name} ${person.last_name}` : 'A racer',
        isYou: entry.characterId === ctx.character.id,
        isChallenger: entry.characterId === race.challengerId,
        status: entry.status,
        finishedAt: entry.finishedAt,
        elapsedMinutes: entry.finishedAt !== null && race.startedAt !== null ? Math.max(0, entry.finishedAt - race.startedAt) : null,
        how: entry.how,
        howLabel: entry.howLabel,
        place: places.get(entry.id) ?? null,
        winner: entry.won,
      };
    });
    return {
      id: race.id,
      status: race.status,
      fromCity: race.fromCity,
      toCity: race.toCity,
      challengerId: race.challengerId,
      createdAt: race.createdAtMinute,
      startedAt: race.startedAt,
      expiresAt: race.expiresAt,
      decided: race.decidedAt !== null,
      racers: dtos,
    };
  }
}

function ordinal(place: number): string {
  return place === 1 ? 'first' : place === 2 ? 'second' : place === 3 ? 'third' : `${place}th`;
}
