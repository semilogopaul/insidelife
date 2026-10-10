import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BETTING_APP_NAME,
  BETTING_RULES,
  BET_SELECTIONS,
  LEAGUE_CLOCK,
  ODDS_SCALE,
  birthDateProblem,
  BIRTH_DATE_MESSAGES,
  combinedOdds,
  dayIndexOf,
  findBettingClub,
  formatNaira,
  selectionWins,
  slipReturns,
  utcCalendarDate,
  type BetLegDto,
  type BetLegRequest,
  type BetQuoteDto,
  type BetQuoteRequest,
  type BetSlipDto,
  type BetSlipsDto,
  type BettingAccountDto,
  type PlaceBetRequest,
  type PlaceBetResultDto,
  type SelfExclusionDays,
  type UpdateBettingLimitsRequest,
} from '@insidelife/shared';
import { GameRuleException, ValidationFailedException } from '../../common/exceptions/domain.exception.js';
import type { AppConfig } from '../../config/configuration.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { UsersService } from '../users/users.service.js';
import { BetSlipEntity, type BetSlipLeg } from './entities/bet-slip.entity.js';
import { BettingProfileEntity } from './entities/betting-profile.entity.js';
import { LeagueService } from './league.service.js';
import {
  bettingBlock,
  changeLossLimit,
  checkLossLimit,
  checkSlip,
  effectiveLossLimit,
  exclusionEnd,
  type RuleCheck,
} from './rules/slip.rules.js';

/** Slips listed in My bets (open ones first by kickoff, then the latest settled). */
const LIST_LIMIT = 60;

interface DayTotals {
  readonly staked: number;
  readonly won: number;
}

/**
 * Odogwu Odds: slips against the house on the Lagos League. Everything runs inside the bettor's `CharacterSession`:
 * the stake is paid to the burn sink when the slip is placed (key `bet-stake:<idempotencyKey>`), and due slips are
 * settled in the bettor's own settle (`BettingSystem.onSettled` and `summarize`), paying winnings once
 * (`bet-win:<slipId>`, unearned income). No money ever moves between players.
 */
@Injectable()
export class BettingService {
  private readonly maxStake: number;
  private readonly maxDailyLoss: number;
  /** The game minute each session last settled its slips at (one query per transaction and minute). */
  private readonly settledAt = new WeakMap<SimulationContext, number>();

  constructor(
    private readonly league: LeagueService,
    private readonly users: UsersService,
    config: ConfigService<AppConfig, true>,
  ) {
    const betting = config.get('betting', { infer: true });
    this.maxStake = betting.maxStake;
    this.maxDailyLoss = betting.dailyLossLimit;
  }

  // ----- Reads -----------------------------------------------------------------------------------------------------

  async account(ctx: SimulationContext): Promise<BettingAccountDto> {
    await this.settleDue(ctx);
    const nowMs = Date.now();
    // One at a time: these share the session's transaction connection.
    const profile = await this.profile(ctx);
    const birthDate = await this.users.birthDate(ctx.character.userId, ctx.manager);
    const today = await this.dayTotals(ctx);
    const lifetime = await this.lifetime(ctx);
    const block = bettingBlock({
      birthDate,
      nowMs,
      excludedUntil: profile?.excludedUntil ?? null,
      characterAge: ctx.age,
    });
    const limit = this.lossLimit(profile, nowMs);
    const pendingDue = profile?.pendingLimitAt && profile.pendingLimitAt.getTime() <= nowMs;
    const netLoss = today.staked - today.won;
    return {
      block: block?.block ?? null,
      blockMessage: block?.message ?? null,
      excludedUntil:
        profile?.excludedUntil && profile.excludedUntil.getTime() > nowMs
          ? profile.excludedUntil.toISOString()
          : null,
      cash: ctx.wallet.cash,
      limits: {
        minStake: BETTING_RULES.minStake,
        maxStake: this.maxStake,
        maxPayout: BETTING_RULES.maxPayout,
        maxLegs: BETTING_RULES.maxLegs,
        dailyLossLimit: limit,
        maxDailyLossLimit: this.maxDailyLoss,
        pendingDailyLossLimit:
          profile && profile.pendingLossLimit !== null && profile.pendingLimitAt && !pendingDue
            ? { amount: profile.pendingLossLimit, effectiveAt: profile.pendingLimitAt.toISOString() }
            : null,
        realityCheckMinutes: profile?.realityCheckMinutes ?? BETTING_RULES.defaultRealityCheckMinutes,
      },
      // A winning day doesn't raise the limit you can see: what's left never reads more than the limit itself.
      today: { staked: today.staked, won: today.won, netLoss, lossLeft: Math.min(limit, Math.max(0, limit - netLoss)) },
      lifetime,
      openSlips: lifetime.open,
    };
  }

  async slips(ctx: SimulationContext): Promise<BetSlipsDto> {
    await this.settleDue(ctx);
    const open = await ctx.manager.find(BetSlipEntity, {
      where: { characterId: ctx.character.id, status: 'open' },
      order: { settlesAt: 'ASC' },
      take: LIST_LIMIT,
    });
    const settled = await ctx.manager
      .createQueryBuilder(BetSlipEntity, 'slip')
      .where('slip.character_id = :id AND slip.status <> :open', { id: ctx.character.id, open: 'open' })
      .orderBy('slip.placed_at', 'DESC')
      .limit(Math.max(10, LIST_LIMIT - open.length))
      .getMany();
    return { slips: [...open, ...settled].map((slip) => this.toSlip(slip)) };
  }

  /** What a slip would pay and whether it can go on now (the drawer's live returns). Never charges anything. */
  async quote(ctx: SimulationContext, request: BetQuoteRequest): Promise<BetQuoteDto> {
    const legs = this.resolveLegs(request.legs);
    const odds = legs.map((leg) => leg.odds ?? 0);
    const stake = Math.floor(request.stake);
    const { returns, capped } = slipReturns(stake, odds);
    const problem = await this.problem(ctx, legs, stake);
    return {
      legs: legs.map((leg) => this.toLeg(leg, null)),
      stake,
      totalOdds: legs.length > 0 ? combinedOdds(odds) : 0,
      potentialReturns: legs.some((leg) => leg.odds === null) ? 0 : returns,
      capped,
      problem: problem.ok ? null : problem.message,
    };
  }

  // ----- Commands --------------------------------------------------------------------------------------------------

  async place(
    ctx: SimulationContext,
    request: PlaceBetRequest & { readonly idempotencyKey: string },
  ): Promise<PlaceBetResultDto> {
    const existing = await ctx.manager.findOne(BetSlipEntity, {
      where: { characterId: ctx.character.id, idempotencyKey: request.idempotencyKey },
    });
    if (existing) return { slip: this.toSlip(existing), balanceAfter: ctx.wallet.cash };

    const legs = this.resolveLegs(request.legs);
    const stake = request.stake;
    const problem = await this.problem(ctx, legs, stake);
    if (!problem.ok) throw new GameRuleException(problem.code, problem.message);

    const priced = legs as ReadonlyArray<BetSlipLeg>;
    const { returns, capped } = slipReturns(
      stake,
      priced.map((leg) => leg.odds),
    );
    // Spending against the house: no counterparty, so it can never count as (or become) a transfer between players.
    await ctx.wallet.pay(stake, 'betting', this.memo(priced), `bet-stake:${request.idempotencyKey}`, {
      refuseRepeat: 'That slip is already being placed.',
      metadata: { legs: priced.length, potentialReturns: returns },
    });
    const slip = await ctx.manager.save(
      ctx.manager.create(BetSlipEntity, {
        characterId: ctx.character.id,
        stake,
        potentialReturns: returns,
        capped,
        legs: [...priced],
        status: 'open',
        payout: 0,
        placedAt: ctx.time,
        placedDay: dayIndexOf(ctx.time),
        settlesAt: Math.max(...priced.map((leg) => leg.kickoffAt)) + LEAGUE_CLOCK.fullTimeAt,
        settledAt: null,
        settledDay: null,
        idempotencyKey: request.idempotencyKey,
      }),
    );
    return { slip: this.toSlip(slip), balanceAfter: ctx.wallet.cash };
  }

  async updateLimits(
    ctx: SimulationContext,
    request: UpdateBettingLimitsRequest,
  ): Promise<BettingAccountDto> {
    const profile = (await this.profile(ctx)) ?? this.newProfile(ctx);
    if (request.dailyLossLimit !== undefined) {
      const change = changeLossLimit(
        {
          limit: profile.dailyLossLimit,
          pending: profile.pendingLossLimit,
          pendingAt: profile.pendingLimitAt,
        },
        request.dailyLossLimit,
        Date.now(),
        this.maxDailyLoss,
      );
      if (!change.ok) throw new GameRuleException(change.code, change.message);
      profile.dailyLossLimit = change.limit;
      profile.pendingLossLimit = change.pending;
      profile.pendingLimitAt = change.pendingAt;
    }
    if (request.realityCheckMinutes !== undefined) profile.realityCheckMinutes = request.realityCheckMinutes;
    await ctx.manager.save(profile);
    return this.account(ctx);
  }

  /** Take a break from betting for 1, 7 or 30 real days. It can only be made longer, never shorter. */
  async selfExclude(ctx: SimulationContext, days: SelfExclusionDays): Promise<BettingAccountDto> {
    const profile = (await this.profile(ctx)) ?? this.newProfile(ctx);
    profile.excludedUntil = exclusionEnd(profile.excludedUntil, days, Date.now());
    await ctx.manager.save(profile);
    return this.account(ctx);
  }

  /** Accounts made before sign-up asked for a date of birth confirm it once here. */
  async confirmBirthDate(ctx: SimulationContext, birthDate: string): Promise<BettingAccountDto> {
    const problem = birthDateProblem(birthDate, utcCalendarDate(Date.now() + 14 * 60 * 60_000));
    // Too young for the game at all still gets recorded (and refused betting): no second guess with another year.
    if (problem && problem !== 'too-young')
      throw new ValidationFailedException([BIRTH_DATE_MESSAGES[problem]]);
    const saved = await this.users.confirmBirthDate(ctx.character.userId, birthDate, ctx.manager);
    if (!saved)
      throw new GameRuleException(
        'BIRTH_DATE_SET',
        'Your date of birth is already on your account. Contact support if it’s wrong.',
      );
    return this.account(ctx);
  }

  // ----- Settlement ------------------------------------------------------------------------------------------------

  /**
   * In the bettor's own session: settle every slip whose last match is over. Each slip is claimed with one
   * `UPDATE … WHERE status = 'open' RETURNING`, so it settles once; the winnings key `bet-win:<slipId>` makes the
   * credit exactly-once on top of that (a replayed transaction can't pay twice). Cheap when nothing is due: one query
   * on a partial index, and only once per transaction and game minute.
   */
  async settleDue(ctx: SimulationContext): Promise<void> {
    if (this.settledAt.get(ctx) === ctx.time) return;
    this.settledAt.set(ctx, ctx.time);
    const due = await ctx.manager
      .createQueryBuilder(BetSlipEntity, 'slip')
      .where('slip.character_id = :id AND slip.status = :open AND slip.settles_at <= :now', {
        id: ctx.character.id,
        open: 'open',
        now: ctx.time,
      })
      .orderBy('slip.settles_at', 'ASC')
      .getMany();
    for (const slip of due) {
      const won = slip.legs.every((leg) => this.legWon(leg));
      const payout = won ? slip.potentialReturns : 0;
      const claimed: Array<{ id: string }> = await ctx.manager.query(
        `WITH claimed AS (
           UPDATE betting_slips SET status = $2, payout = $3, settled_at = $4, settled_day = $5
            WHERE id = $1 AND status = 'open' RETURNING id
         ) SELECT id FROM claimed`,
        [slip.id, won ? 'won' : 'lost', payout, ctx.time, dayIndexOf(ctx.time)],
      );
      if (claimed.length === 0 || !won || payout <= 0) continue;
      await ctx.wallet.receive(
        payout,
        'betting',
        `${BETTING_APP_NAME} winnings: ${this.memo(slip.legs)}`,
        `bet-win:${slip.id}`,
        {
          income: 'unearned',
          metadata: { slipId: slip.id, stake: slip.stake },
        },
      );
      ctx.notify({
        kind: 'money-received',
        title: `🎉 Your slip came in: ${formatNaira(payout)}`,
        body: `${BETTING_APP_NAME}: ${this.memo(slip.legs)} at ${combinedOdds(slip.legs.map((leg) => leg.odds)).toFixed(2)} won. Game naira only.`,
        tone: 'good',
        amount: payout,
      });
    }
  }

  // ----- helpers ---------------------------------------------------------------------------------------------------

  /** Legs priced from the league (the client only names the match and the pick). */
  private resolveLegs(requested: readonly BetLegRequest[]): Array<BetSlipLeg & { readonly odds: number }> {
    if (requested.length > BETTING_RULES.maxLegs)
      throw new GameRuleException(
        'TOO_MANY_LEGS',
        `A slip can have at most ${BETTING_RULES.maxLegs} selections.`,
      );
    return requested.map((leg) => {
      const match = this.league.match(leg.matchId);
      return {
        matchId: match.matchId,
        round: match.round,
        homeId: match.homeId,
        awayId: match.awayId,
        kickoffAt: match.kickoffAt,
        selection: leg.selection,
        // Null odds (off the board) stay null for the rules; they never reach a saved slip.
        odds: match.odds[leg.selection] as number,
      };
    });
  }

  /** The first reason this slip can't be placed now (eligibility, legs and stake, cash, the daily loss limit). */
  private async problem(
    ctx: SimulationContext,
    legs: ReadonlyArray<BetSlipLeg & { readonly odds: number | null }>,
    stake: number,
  ): Promise<RuleCheck> {
    const nowMs = Date.now();
    const profile = await this.profile(ctx);
    const birthDate = await this.users.birthDate(ctx.character.userId, ctx.manager);
    const block = bettingBlock({
      birthDate,
      nowMs,
      excludedUntil: profile?.excludedUntil ?? null,
      characterAge: ctx.age,
    });
    if (block)
      return {
        ok: false,
        code: block.block === 'self-excluded' ? 'SELF_EXCLUDED' : 'NOT_ELIGIBLE',
        message: block.message,
      };
    // Server time decides the kickoff cut-off, never the client's clock.
    const slip = checkSlip({ legs, stake, now: this.league.now(), maxStake: this.maxStake });
    if (!slip.ok) return slip;
    if (!ctx.wallet.canAfford(stake))
      return {
        ok: false,
        code: 'INSUFFICIENT_FUNDS',
        message: `You need ${formatNaira(stake)} in cash for that stake.`,
      };
    const today = await this.dayTotals(ctx);
    return checkLossLimit({
      netLossToday: today.staked - today.won,
      stake,
      limit: this.lossLimit(profile, nowMs),
    });
  }

  private lossLimit(profile: BettingProfileEntity | null, nowMs: number): number {
    return effectiveLossLimit(
      {
        limit: profile?.dailyLossLimit ?? null,
        pending: profile?.pendingLossLimit ?? null,
        pendingAt: profile?.pendingLimitAt ?? null,
      },
      nowMs,
      this.maxDailyLoss,
    );
  }

  private legWon(leg: BetSlipLeg): boolean {
    const { result } = this.league.match(leg.matchId);
    return selectionWins(leg.selection, result.home, result.away);
  }

  private profile(ctx: SimulationContext): Promise<BettingProfileEntity | null> {
    return ctx.manager.findOne(BettingProfileEntity, { where: { userId: ctx.character.userId } });
  }

  private newProfile(ctx: SimulationContext): BettingProfileEntity {
    return ctx.manager.create(BettingProfileEntity, {
      userId: ctx.character.userId,
      dailyLossLimit: null,
      pendingLossLimit: null,
      pendingLimitAt: null,
      excludedUntil: null,
      realityCheckMinutes: BETTING_RULES.defaultRealityCheckMinutes,
    });
  }

  /** Stakes placed and winnings paid this game day. */
  private async dayTotals(ctx: SimulationContext): Promise<DayTotals> {
    const day = dayIndexOf(ctx.time);
    const rows: Array<{ staked: string; won: string }> = await ctx.manager.query(
      `SELECT COALESCE(SUM(stake) FILTER (WHERE placed_day = $2), 0)::bigint AS staked,
              COALESCE(SUM(payout) FILTER (WHERE settled_day = $2), 0)::bigint AS won
         FROM betting_slips WHERE character_id = $1 AND (placed_day = $2 OR settled_day = $2)`,
      [ctx.character.id, day],
    );
    return { staked: Number(rows[0]?.staked ?? 0), won: Number(rows[0]?.won ?? 0) };
  }

  private async lifetime(
    ctx: SimulationContext,
  ): Promise<{ staked: number; won: number; slips: number; open: number }> {
    const rows: Array<{ staked: string; won: string; slips: number; open: number }> = await ctx.manager.query(
      `SELECT COALESCE(SUM(stake), 0)::bigint AS staked, COALESCE(SUM(payout), 0)::bigint AS won, COUNT(*)::int AS slips,
              COUNT(*) FILTER (WHERE status = 'open')::int AS open
         FROM betting_slips WHERE character_id = $1`,
      [ctx.character.id],
    );
    const row = rows[0];
    return {
      staked: Number(row?.staked ?? 0),
      won: Number(row?.won ?? 0),
      slips: row?.slips ?? 0,
      open: row?.open ?? 0,
    };
  }

  private memo(legs: readonly BetSlipLeg[]): string {
    if (legs.length > 1) return `${legs.length}-leg accumulator`;
    const leg = legs[0];
    if (!leg) return 'slip';
    const home = findBettingClub(leg.homeId)?.code ?? leg.homeId;
    const away = findBettingClub(leg.awayId)?.code ?? leg.awayId;
    return `${home} v ${away}, ${BET_SELECTIONS[leg.selection].label}`;
  }

  private toLeg(
    leg: BetSlipLeg & { readonly odds: number | null },
    status: BetSlipEntity['status'] | null,
  ): BetLegDto {
    const definition = BET_SELECTIONS[leg.selection];
    // Results only for settled slips (every match on them is over).
    const settled = status !== null && status !== 'open';
    const result = settled ? this.league.match(leg.matchId).result : null;
    return {
      matchId: leg.matchId,
      round: leg.round,
      homeId: leg.homeId,
      awayId: leg.awayId,
      kickoffAt: leg.kickoffAt,
      market: definition.market,
      selection: leg.selection,
      label: definition.label,
      odds: (leg.odds ?? 0) / ODDS_SCALE,
      result: result ? (selectionWins(leg.selection, result.home, result.away) ? 'won' : 'lost') : 'pending',
      score: result ? { home: result.home, away: result.away } : null,
    };
  }

  private toSlip(slip: BetSlipEntity): BetSlipDto {
    return {
      id: slip.id,
      placedAt: slip.placedAt,
      stake: slip.stake,
      totalOdds: combinedOdds(slip.legs.map((leg) => leg.odds)),
      potentialReturns: slip.potentialReturns,
      capped: slip.capped,
      status: slip.status,
      payout: slip.payout,
      settlesAt: slip.settlesAt,
      settledAt: slip.settledAt,
      legs: slip.legs.map((leg) => this.toLeg(leg, slip.status)),
    };
  }
}
