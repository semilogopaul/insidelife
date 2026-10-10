import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  BetQuoteDto as BetQuoteResponse,
  BetSlipsDto,
  BettingAccountDto,
  BettingLeagueDto,
  LeagueTableDto,
  PlaceBetResultDto,
  RoundResultsDto,
} from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { BettingService } from './betting.service.js';
import {
  BetQuoteDto,
  ConfirmBirthDateDto,
  PlaceBetDto,
  ResultsQueryDto,
  SelfExclusionDto,
  UpdateBettingLimitsDto,
} from './dto/betting.dto.js';
import { LeagueService } from './league.service.js';

/** The betting app: the Lagos League board, slips against the house, and responsible-play settings. */
@Controller({ path: 'betting', version: '1' })
export class BettingController {
  constructor(
    private readonly session: CharacterSession,
    private readonly league: LeagueService,
    private readonly betting: BettingService,
  ) {}

  /** The week open for betting (odds) and the week live or just played (its whole timeline, from kickoff). */
  @Get('league')
  board(): BettingLeagueDto {
    return this.league.board();
  }

  @Get('table')
  table(): LeagueTableDto {
    return this.league.table();
  }

  @Get('results')
  results(@Query() query: ResultsQueryDto): RoundResultsDto {
    return this.league.results(query.round);
  }

  @Get('me')
  account(@CurrentUser() user: AuthUser): Promise<BettingAccountDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.betting.account(ctx));
  }

  /** My bets: due slips are settled (and paid) before this is built. */
  @Get('slips')
  slips(@CurrentUser() user: AuthUser): Promise<BetSlipsDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.betting.slips(ctx));
  }

  /** Live returns for the slip drawer (charges nothing). */
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post('quotes')
  quote(@CurrentUser() user: AuthUser, @Body() body: BetQuoteDto): Promise<BetQuoteResponse> {
    return this.session.run({ userId: user.userId }, (ctx) => this.betting.quote(ctx, body));
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('slips')
  place(@CurrentUser() user: AuthUser, @Body() body: PlaceBetDto): Promise<PlaceBetResultDto> {
    const { idempotencyKey, ...request } = body;
    return this.session.run(
      { userId: user.userId },
      (ctx) =>
        ctx.once('bet-slip', idempotencyKey, request, () =>
          this.betting.place(ctx, { ...request, idempotencyKey }),
        ),
      { touch: true },
    );
  }

  @Put('me/limits')
  limits(@CurrentUser() user: AuthUser, @Body() body: UpdateBettingLimitsDto): Promise<BettingAccountDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.betting.updateLimits(ctx, body), {
      touch: true,
    });
  }

  /** Take a break: 1, 7 or 30 real days, and it can't be undone early. */
  @Post('me/self-exclusions')
  selfExclude(@CurrentUser() user: AuthUser, @Body() body: SelfExclusionDto): Promise<BettingAccountDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.betting.selfExclude(ctx, body.days), {
      touch: true,
    });
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Put('me/birth-date')
  birthDate(@CurrentUser() user: AuthUser, @Body() body: ConfirmBirthDateDto): Promise<BettingAccountDto> {
    return this.session.run(
      { userId: user.userId },
      (ctx) => this.betting.confirmBirthDate(ctx, body.birthDate),
      { touch: true },
    );
  }
}
