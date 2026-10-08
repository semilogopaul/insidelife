import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import type {
  DepositDto,
  DepositWithdrawalResultDto,
  FxResultDto,
  MarketsDto,
  PortfolioDto,
  PriceHistoryDto,
  TradeDto,
  TradeResultDto,
} from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { GameRuleException } from '../../common/exceptions/domain.exception.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { DepositsService } from './deposits.service.js';
import { CreateDepositDto, FxOrderDto, PlaceOrderDto, PriceHistoryQueryDto, TradeHistoryQueryDto } from './dto/investments.dto.js';
import { FxService } from './fx.service.js';
import { MarketDataService } from './market-data.service.js';
import { PortfolioService } from './portfolio.service.js';
import { TradingService } from './trading.service.js';
import { toMicroUnits } from './trading-math.js';

/** Client key when given (retries execute once), otherwise a fresh key per request. */
const keyFor = (clientKey: string | undefined): string => clientKey ?? `auto-${randomUUID()}`;

const exactlyOne = (a: number | undefined, b: number | undefined, names: string): void => {
  if ((a === undefined) === (b === undefined)) throw new GameRuleException('INVALID_ORDER', `Give exactly one of ${names}`);
};

@Controller({ path: 'markets', version: '1' })
export class MarketsController {
  constructor(private readonly market: MarketDataService) {}

  @Get()
  markets(): MarketsDto {
    return this.market.markets();
  }

  @Get(':id/history')
  history(@Param('id') id: string, @Query() query: PriceHistoryQueryDto): PriceHistoryDto {
    return this.market.history(id, query.days ?? 90);
  }
}

@Controller({ path: 'portfolio', version: '1' })
export class PortfolioController {
  constructor(
    private readonly session: CharacterSession,
    private readonly portfolio: PortfolioService,
  ) {}

  @Get()
  portfolioView(@CurrentUser() user: AuthUser): Promise<PortfolioDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.portfolio.build(ctx));
  }
}

@Controller({ path: 'investments', version: '1' })
export class InvestmentsController {
  constructor(
    private readonly session: CharacterSession,
    private readonly trading: TradingService,
    private readonly deposits: DepositsService,
  ) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('orders')
  placeOrder(@CurrentUser() user: AuthUser, @Body() body: PlaceOrderDto): Promise<TradeResultDto> {
    exactlyOne(body.amountNaira, body.units, 'amountNaira or units');
    const size = body.units !== undefined ? { microUnits: toMicroUnits(body.units) } : { amountNaira: body.amountNaira ?? 0 };
    return this.session.run(
      { userId: user.userId },
      (ctx) => this.trading.placeOrder(ctx, { instrumentId: body.instrumentId, side: body.side, size }, keyFor(body.idempotencyKey)),
      { touch: true },
    );
  }

  @Get('orders')
  trades(@CurrentUser() user: AuthUser, @Query() query: TradeHistoryQueryDto): Promise<TradeDto[]> {
    return this.session.run({ userId: user.userId }, (ctx) => this.trading.recentTrades(ctx, query.limit ?? 50));
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('deposits')
  openDeposit(@CurrentUser() user: AuthUser, @Body() body: CreateDepositDto): Promise<DepositDto> {
    return this.session.run(
      { userId: user.userId },
      (ctx) => this.deposits.open(ctx, { product: body.product, tenorDays: body.tenorDays ?? null, amount: body.amount }, keyFor(body.idempotencyKey)),
      { touch: true },
    );
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('deposits/:id/withdrawal')
  withdraw(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<DepositWithdrawalResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.deposits.withdraw(ctx, id), { touch: true });
  }
}

@Controller({ path: 'fx', version: '1' })
export class FxController {
  constructor(
    private readonly session: CharacterSession,
    private readonly fx: FxService,
  ) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('orders')
  order(@CurrentUser() user: AuthUser, @Body() body: FxOrderDto): Promise<FxResultDto> {
    exactlyOne(body.amountNaira, body.amountUsd, 'amountNaira or amountUsd');
    const amount = body.amountUsd !== undefined ? { usdCents: Math.round(body.amountUsd * 100) } : { naira: body.amountNaira ?? 0 };
    return this.session.run({ userId: user.userId }, (ctx) => this.fx.order(ctx, { side: body.side, amount }, keyFor(body.idempotencyKey)), {
      touch: true,
    });
  }
}
