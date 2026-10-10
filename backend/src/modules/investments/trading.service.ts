import { Injectable } from '@nestjs/common';
import {
  DAYS_PER_YEAR,
  INSTRUMENTS,
  MAX_ORDER_NAIRA,
  MAX_UNITS_PER_HOLDING,
  MICRO_UNITS_PER_UNIT,
  MIN_ORDER_NAIRA,
  dayIndexOf,
  formatNaira,
  isDividendRecordDay,
  withholdingTax,
  type InstrumentDefinition,
  type OrderSide,
  type TradeDto,
  type TradeResultDto,
} from '@insidelife/shared';
import { ConflictException, GameRuleException, InsufficientFundsException } from '../../common/exceptions/domain.exception.js';
import type { RowProbe } from '../simulation/row-presence.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { InvestmentHoldingEntity } from './entities/holding.entity.js';
import { InvestmentTradeEntity } from './entities/trade.entity.js';
import { FxAllowanceService } from './fx-allowance.service.js';
import { formatPrice, holdingDto, tradeDto } from './investment.mapper.js';
import { MarketDataService } from './market-data.service.js';
import { floorMoney, fromMicroUnits, quoteBuy, quoteSell, type OrderSize } from './trading-math.js';

export interface MarketOrder {
  readonly instrumentId: string;
  readonly side: OrderSide;
  readonly size: OrderSize;
}

const HOLDINGS_MEMO = 'investments:holdings';
/** Most characters hold no shares or coins: the read is skipped when there's no row (see `RowProbe`). */
export const HOLDING_ROWS: RowProbe = { key: 'investments:holdings', table: 'investment_holdings', where: 'character_id = $1' };
const MAX_MICRO_UNITS = MAX_UNITS_PER_HOLDING * MICRO_UNITS_PER_UNIT;

/**
 * Market orders on stocks and crypto at today's deterministic price. Buys pay units × price to `system:market` and the
 * broker fee (1.5% stocks / 1% crypto) to `system:fees`; sells reverse it. Realised gains count as earned income;
 * the returned capital is neutral. Also pays yearly dividends (minus 10% WHT) to holders on record dates.
 *
 * All mutations run inside the character's `CharacterSession`, which serialises them on the character row.
 */
@Injectable()
export class TradingService {
  constructor(
    private readonly market: MarketDataService,
    private readonly allowance: FxAllowanceService,
  ) {}

  holdings(ctx: SimulationContext): Promise<InvestmentHoldingEntity[]> {
    return ctx.memo(HOLDINGS_MEMO, async () =>
      (await ctx.mayHaveRows(HOLDING_ROWS))
        ? ctx.manager.find(InvestmentHoldingEntity, { where: { characterId: ctx.character.id }, order: { instrumentId: 'ASC' } })
        : [],
    );
  }

  /** Market value of all positions at today's prices (net-worth hook). */
  async holdingsValue(ctx: SimulationContext): Promise<number> {
    const day = dayIndexOf(ctx.time);
    let total = 0;
    for (const holding of await this.holdings(ctx)) {
      total += holdingDto(holding, this.market.price(holding.instrumentId, day)).value;
    }
    return total;
  }

  async placeOrder(ctx: SimulationContext, order: MarketOrder, idempotencyKey: string): Promise<TradeResultDto> {
    const instrument = this.market.instrument(order.instrumentId);
    const key = `order:${idempotencyKey}`;
    const previous = await ctx.manager.findOne(InvestmentTradeEntity, { where: { characterId: ctx.character.id, idempotencyKey: key } });
    if (previous) {
      if (previous.instrumentId !== instrument.id || previous.side !== order.side) {
        throw new ConflictException('IDEMPOTENCY_KEY_REUSED', 'That order key was already used for a different order');
      }
      return this.result(ctx, previous);
    }

    const price = this.market.price(instrument.id, dayIndexOf(ctx.time));
    const trade = order.side === 'buy' ? await this.buy(ctx, instrument, price, order.size, key) : await this.sell(ctx, instrument, price, order.size, key);
    ctx.invalidate('investments');
    return this.result(ctx, trade);
  }

  async recentTrades(ctx: SimulationContext, limit: number): Promise<TradeDto[]> {
    const trades = await ctx.manager.find(InvestmentTradeEntity, {
      where: { characterId: ctx.character.id },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return trades.map(tradeDto);
  }

  /** Simulation: pay dividends to holders at the end of each instrument's record date. Never throws for bad luck. */
  async payDividends(ctx: SimulationContext, dayIndex: number): Promise<void> {
    const holdings = await this.holdings(ctx);
    if (holdings.length === 0) return;
    const year = Math.floor(dayIndex / DAYS_PER_YEAR);
    for (const holding of holdings) {
      const instrument = INSTRUMENTS.find((candidate) => candidate.id === holding.instrumentId);
      if (!instrument || !isDividendRecordDay(instrument, dayIndex)) continue;
      const perUnit = this.market.price(instrument.id, dayIndex) * instrument.dividendYield;
      const gross = floorMoney((holding.microUnits * perUnit) / MICRO_UNITS_PER_UNIT);
      if (gross < 1) continue;
      const tax = withholdingTax(gross);
      await ctx.wallet.receive(gross, 'investment', `Dividend: ${instrument.id}`, `dividend:${instrument.id}:${year}`, {
        income: 'earned',
        metadata: { instrumentId: instrument.id, units: fromMicroUnits(holding.microUnits) },
      });
      await ctx.wallet.tryPay(tax, 'tax', `Withholding tax on ${instrument.id} dividend`, `dividend-wht:${instrument.id}:${year}`, { sink: 'tax' });
      ctx.report({ label: `${instrument.id} dividend`, amount: gross - tax, tone: 'good' });
      if (gross - tax >= 1_000) {
        ctx.notify({
          kind: 'investment',
          title: `${instrument.id} paid a dividend`,
          body: `${formatNaira(gross - tax)} landed after 10% withholding tax.`,
          tone: 'good',
          amount: gross - tax,
        });
      }
    }
  }

  private async buy(ctx: SimulationContext, instrument: InstrumentDefinition, price: number, size: OrderSize, key: string): Promise<InvestmentTradeEntity> {
    if ('amountNaira' in size && (size.amountNaira < MIN_ORDER_NAIRA || size.amountNaira > MAX_ORDER_NAIRA)) {
      throw new GameRuleException('ORDER_SIZE', `Orders must be between ${formatNaira(MIN_ORDER_NAIRA)} and ${formatNaira(MAX_ORDER_NAIRA)}`);
    }
    const quote = quoteBuy(instrument.kind, price, size);
    if (quote.microUnits <= 0 || quote.gross < MIN_ORDER_NAIRA) {
      throw new GameRuleException('ORDER_TOO_SMALL', `The smallest order is ${formatNaira(MIN_ORDER_NAIRA)}`);
    }
    if (quote.gross > MAX_ORDER_NAIRA) throw new GameRuleException('ORDER_SIZE', `The largest order is ${formatNaira(MAX_ORDER_NAIRA)}`);

    const holding = (await this.holdings(ctx)).find((candidate) => candidate.instrumentId === instrument.id);
    if ((holding?.microUnits ?? 0) + quote.microUnits > MAX_MICRO_UNITS) {
      throw new GameRuleException('POSITION_TOO_LARGE', `You can hold at most ${MAX_UNITS_PER_HOLDING.toLocaleString('en-NG')} units of ${instrument.id}`);
    }
    if (FxAllowanceService.isDollarProxy(instrument.id)) {
      await this.allowance.assertWithin(ctx, FxAllowanceService.usdtCents(quote.microUnits), ctx.world.economy(ctx.time).usdRate);
    }
    const total = quote.gross + quote.fee;
    if (!ctx.wallet.canAfford(total)) throw new InsufficientFundsException(total);

    const units = fromMicroUnits(quote.microUnits);
    await ctx.wallet.pay(quote.gross, 'investment', `Bought ${units} ${instrument.id} @ ${formatPrice(price)}`, `trade:${key}`, {
      sink: 'market',
      metadata: { instrumentId: instrument.id, units, price },
    });
    await ctx.wallet.pay(quote.fee, 'fee', `Broker fee — ${instrument.id}`, `trade-fee:${key}`, { sink: 'fees' });

    if (holding) {
      holding.microUnits += quote.microUnits;
      holding.costBasis += total;
      await ctx.manager.save(holding);
    } else {
      await ctx.manager.insert(InvestmentHoldingEntity, {
        characterId: ctx.character.id,
        instrumentId: instrument.id,
        microUnits: quote.microUnits,
        costBasis: total,
      });
    }
    return this.record(ctx, key, instrument.id, 'buy', quote.microUnits, price, quote.gross, quote.fee, null);
  }

  private async sell(ctx: SimulationContext, instrument: InstrumentDefinition, price: number, size: OrderSize, key: string): Promise<InvestmentTradeEntity> {
    const holding = (await this.holdings(ctx)).find((candidate) => candidate.instrumentId === instrument.id);
    if (!holding || holding.microUnits <= 0) throw new GameRuleException('NO_POSITION', `You don’t own any ${instrument.id}`);
    if ('microUnits' in size && size.microUnits > holding.microUnits) {
      throw new GameRuleException('NOT_ENOUGH_UNITS', `You only have ${fromMicroUnits(holding.microUnits)} ${instrument.id}`);
    }
    const quote = quoteSell(instrument.kind, price, holding.microUnits, holding.costBasis, size);
    if (quote.microUnits <= 0 || quote.gross <= quote.fee) throw new GameRuleException('ORDER_TOO_SMALL', 'That sale is too small to cover the broker fee');

    const units = fromMicroUnits(quote.microUnits);
    await ctx.wallet.receive(quote.gross, 'investment', `Sold ${units} ${instrument.id} @ ${formatPrice(price)}`, `trade:${key}`, {
      income: 'neutral',
      source: 'market',
      metadata: { instrumentId: instrument.id, units, price },
    });
    await ctx.wallet.pay(quote.fee, 'fee', `Broker fee — ${instrument.id}`, `trade-fee:${key}`, { sink: 'fees' });
    // Capital coming back is neutral; only the realised profit counts toward the self-made rich list.
    if (quote.realizedGain > 0) ctx.character.earnedTotal += quote.realizedGain;

    holding.microUnits -= quote.microUnits;
    holding.costBasis -= quote.costPortion;
    if (holding.microUnits <= 0) await ctx.manager.remove(holding);
    else await ctx.manager.save(holding);
    return this.record(ctx, key, instrument.id, 'sell', quote.microUnits, price, quote.gross, quote.fee, quote.realizedGain);
  }

  private async record(
    ctx: SimulationContext,
    idempotencyKey: string,
    instrumentId: string,
    side: OrderSide,
    quantity: number,
    price: number,
    gross: number,
    fee: number,
    realizedGain: number | null,
  ): Promise<InvestmentTradeEntity> {
    return ctx.manager.save(
      ctx.manager.create(InvestmentTradeEntity, {
        characterId: ctx.character.id,
        idempotencyKey,
        instrumentId,
        side,
        quantity,
        price,
        gross,
        fee,
        realizedGain,
        gameMinute: ctx.time,
      }),
    );
  }

  private async result(ctx: SimulationContext, trade: InvestmentTradeEntity): Promise<TradeResultDto> {
    ctx.invalidate(HOLDINGS_MEMO);
    const holding = (await this.holdings(ctx)).find((candidate) => candidate.instrumentId === trade.instrumentId);
    const price = this.market.price(trade.instrumentId, dayIndexOf(ctx.time));
    return { trade: tradeDto(trade), holding: holding ? holdingDto(holding, price) : null, cashBalance: ctx.wallet.cash };
  }
}
