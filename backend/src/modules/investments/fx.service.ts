import { Injectable } from '@nestjs/common';
import { formatNaira, quoteFx, type FxAmount, type FxResultDto, type FxSide } from '@insidelife/shared';
import { ConflictException, GameRuleException, InsufficientFundsException } from '../../common/exceptions/domain.exception.js';
import { LedgerService } from '../ledger/ledger.service.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { FX_INSTRUMENT_ID, InvestmentTradeEntity } from './entities/trade.entity.js';
import { FxAllowanceService } from './fx-allowance.service.js';
import { formatPrice } from './investment.mapper.js';

export interface FxOrder {
  readonly side: FxSide;
  readonly amount: FxAmount;
}

const MIN_FX_NAIRA = 1_000;

/**
 * The dollar desk: buy/sell USD for the domiciliary account at the parallel rate ± 2%. One balanced posting with an
 * NGN leg pair (cash ↔ `system:fx-ngn`) and a USD leg pair (`system:fx-usd` ↔ usd account, in cents). Buying is
 * capped by the monthly FX allowance.
 *
 * Posts through `LedgerService` directly (the wallet API has no multi-currency posting) and then re-syncs the
 * session wallet's cached cash with `ctx.wallet.sync`.
 */
@Injectable()
export class FxService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly allowance: FxAllowanceService,
  ) {}

  async order(ctx: SimulationContext, order: FxOrder, idempotencyKey: string): Promise<FxResultDto> {
    const key = `fx:${idempotencyKey}`;
    const midRate = ctx.world.economy(ctx.time).usdRate;
    const previous = await ctx.manager.findOne(InvestmentTradeEntity, { where: { characterId: ctx.character.id, idempotencyKey: key } });
    if (previous) {
      if (previous.side !== order.side) throw new ConflictException('IDEMPOTENCY_KEY_REUSED', 'That FX key was already used for a different order');
      const balances = await this.ledger.balances(ctx.manager, ctx.character.id);
      return this.result(order.side, midRate, previous.price, previous.gross, previous.quantity, balances.cash, balances.usd);
    }

    const quote = quoteFx(order.side, order.amount, midRate);
    if (quote.usdCents <= 0 || quote.naira < MIN_FX_NAIRA) {
      throw new GameRuleException('FX_TOO_SMALL', `The desk doesn’t handle less than ${formatNaira(MIN_FX_NAIRA)}`);
    }
    const cash = ctx.wallet.accounts.cash;
    const usd = ctx.wallet.accounts.usd;
    const fxNgn = this.ledger.systemAccount('fxNgn');
    const fxUsd = this.ledger.systemAccount('fxUsd');
    const rate = quote.rateKobo / 100;

    if (order.side === 'buy-usd') {
      await this.allowance.assertWithin(ctx, quote.usdCents, midRate);
      if (!ctx.wallet.canAfford(quote.naira)) throw new InsufficientFundsException(quote.naira);
    } else {
      const { usd: usdBalance } = await this.ledger.balances(ctx.manager, ctx.character.id);
      if (usdBalance < quote.usdCents) {
        throw new GameRuleException('INSUFFICIENT_USD', `You only have $${(usdBalance / 100).toFixed(2)} in your dom account`);
      }
    }

    const buying = order.side === 'buy-usd';
    const dollars = (quote.usdCents / 100).toFixed(2);
    const posting = await this.ledger.post(ctx.manager, {
      kind: 'investment',
      idempotencyKey: `${ctx.character.id}:${key}`,
      memo: buying ? `Bought $${dollars} @ ${formatPrice(rate)}` : `Sold $${dollars} @ ${formatPrice(rate)}`,
      gameMinute: ctx.time,
      characterId: ctx.character.id,
      metadata: { side: order.side, usdCents: quote.usdCents, naira: quote.naira, rate, midRate },
      legs: buying
        ? [
            { accountId: cash, amount: -quote.naira },
            { accountId: fxNgn, amount: quote.naira },
            { accountId: fxUsd, amount: -quote.usdCents },
            { accountId: usd, amount: quote.usdCents },
          ]
        : [
            { accountId: usd, amount: -quote.usdCents },
            { accountId: fxUsd, amount: quote.usdCents },
            { accountId: fxNgn, amount: -quote.naira },
            { accountId: cash, amount: quote.naira },
          ],
    });

    ctx.wallet.sync(posting.balances);

    await ctx.manager.save(
      ctx.manager.create(InvestmentTradeEntity, {
        characterId: ctx.character.id,
        idempotencyKey: key,
        instrumentId: FX_INSTRUMENT_ID,
        side: order.side,
        quantity: quote.usdCents,
        price: rate,
        gross: quote.naira,
        fee: 0,
        realizedGain: null,
        gameMinute: ctx.time,
      }),
    );
    const cashAfter = posting.balances.get(cash);
    const usdAfter = posting.balances.get(usd);
    const balances = cashAfter === undefined || usdAfter === undefined ? await this.ledger.balances(ctx.manager, ctx.character.id) : null;
    return this.result(order.side, midRate, rate, quote.naira, quote.usdCents, cashAfter ?? balances?.cash ?? 0, usdAfter ?? balances?.usd ?? 0);
  }

  private result(side: FxSide, midRate: number, appliedRate: number, naira: number, usdCents: number, cashBalance: number, usdBalanceCents: number): FxResultDto {
    return { side, midRate, appliedRate, naira, usdCents, cashBalance, usdBalanceCents };
  }
}
