import type { GameMinute } from '../time/calendar.js';
import type { DepositProductId, FxSide, InstrumentKind, MarketSector, RiskLevel } from '../catalog/investments.js';

/** Investments API contracts — owned by the investments domain. Money is whole naira unless stated otherwise. */

// ----- Markets -------------------------------------------------------------------------------------------------

export interface MarketQuoteDto {
  readonly instrumentId: string;
  readonly name: string;
  readonly kind: InstrumentKind;
  readonly sector: MarketSector;
  readonly blurb: string;
  readonly risk: RiskLevel;
  /** Naira per unit today. */
  readonly price: number;
  /** Relative change vs yesterday (0.012 = +1.2%). */
  readonly change1d: number;
  readonly change30d: number;
  readonly dividendYield: number;
  /** Broker fee rate on trades (0.015 = 1.5%). */
  readonly feeRate: number;
}

export interface MarketsDto {
  readonly dayIndex: number;
  readonly instruments: readonly MarketQuoteDto[];
}

export interface PricePointDto {
  readonly dayIndex: number;
  readonly price: number;
}

export interface PriceHistoryDto {
  readonly instrumentId: string;
  /** Oldest first, ending today. */
  readonly points: readonly PricePointDto[];
}

/** Query for `GET /v1/markets/:id/history` (1-365, default 90). */
export interface PriceHistoryQuery {
  readonly days?: number;
}

// ----- Orders --------------------------------------------------------------------------------------------------

export const ORDER_SIDES = ['buy', 'sell'] as const;
export type OrderSide = (typeof ORDER_SIDES)[number];

/**
 * Market order at today's price. Give exactly one of `amountNaira` (buy: naira to invest, fee charged on top;
 * sell: naira of units to sell, fee deducted) or `units` (up to 6 decimals).
 */
export interface PlaceOrderRequest {
  readonly instrumentId: string;
  readonly side: OrderSide;
  readonly amountNaira?: number;
  readonly units?: number;
  /** Optional client UUID; retries with the same key execute once and return the original trade. */
  readonly idempotencyKey?: string;
}

/** A stock/crypto trade, or an FX desk trade (`instrumentId: 'USD'`, `units` = dollars, `price` = naira per dollar). */
export interface TradeDto {
  readonly id: string;
  readonly instrumentId: string;
  readonly side: OrderSide | FxSide;
  readonly units: number;
  readonly price: number;
  /** Units × price (before fees). */
  readonly gross: number;
  readonly fee: number;
  /** Sells only: proceeds − fee − cost basis of the units sold. */
  readonly realizedGain: number | null;
  readonly gameMinute: GameMinute;
  readonly createdAt: string;
}

export interface HoldingDto {
  readonly instrumentId: string;
  readonly name: string;
  readonly kind: InstrumentKind;
  readonly units: number;
  readonly price: number;
  readonly value: number;
  /** Total paid for the units still held, including fees. */
  readonly costBasis: number;
  readonly unrealizedGain: number;
}

export interface TradeResultDto {
  readonly trade: TradeDto;
  /** Position after the trade (null when fully sold). */
  readonly holding: HoldingDto | null;
  readonly cashBalance: number;
}

// ----- Deposits (fixed deposit, T-bill, money-market fund) ----------------------------------------------------

export const DEPOSIT_STATUSES = ['active', 'matured', 'withdrawn', 'broken'] as const;
export type DepositStatus = (typeof DEPOSIT_STATUSES)[number];

export interface CreateDepositRequest {
  readonly product: DepositProductId;
  /** Required for fixed deposits and T-bills (91, 182 or 364); omitted for the money-market fund. */
  readonly tenorDays?: number;
  readonly amount: number;
  readonly idempotencyKey?: string;
}

export interface DepositDto {
  readonly id: string;
  readonly product: DepositProductId;
  readonly label: string;
  readonly principal: number;
  /** Annual rate locked at purchase (money-market: today's rate). */
  readonly annualRate: number;
  readonly tenorDays: number | null;
  readonly startedAt: GameMinute;
  readonly maturesAt: GameMinute | null;
  /** Gross interest earned so far (before 10% withholding tax). */
  readonly accruedInterest: number;
  /** Gross interest at maturity (fixed-tenor products). */
  readonly interestAtMaturity: number | null;
  readonly status: DepositStatus;
  /** What breaking/withdrawing right now would cost (0 for the money-market fund or once matured). */
  readonly earlyBreakPenalty: number;
}

export interface DepositWithdrawalResultDto {
  readonly deposit: DepositDto;
  readonly principalReturned: number;
  readonly interestPaid: number;
  readonly withholdingTax: number;
  readonly penalty: number;
  readonly cashBalance: number;
}

export interface FixedIncomeOfferDto {
  readonly product: DepositProductId;
  readonly label: string;
  readonly blurb: string;
  readonly minAmount: number;
  /** Today's rates by tenor (`tenorDays: null` for open-ended products). */
  readonly rates: ReadonlyArray<{ readonly tenorDays: number | null; readonly annualRate: number }>;
  readonly earlyBreakPenaltyRate: number;
}

// ----- Schemes too good to be true ----------------------------------------------------------------------------

export interface PonziStakeDto {
  readonly id: string;
  readonly scheme: string;
  readonly amount: number;
  readonly promisedPayout: number;
  readonly payoutAt: GameMinute;
  readonly status: 'active' | 'paid' | 'collapsed';
}

// ----- FX ------------------------------------------------------------------------------------------------------

/** Give exactly one of `amountNaira` or `amountUsd` (dollars, up to 2 decimals). */
export interface FxOrderRequest {
  readonly side: FxSide;
  readonly amountNaira?: number;
  readonly amountUsd?: number;
  readonly idempotencyKey?: string;
}

export interface FxResultDto {
  readonly side: FxSide;
  /** Parallel-market mid rate (naira per dollar). */
  readonly midRate: number;
  /** Rate applied including the 2% spread (naira per dollar). */
  readonly appliedRate: number;
  readonly naira: number;
  readonly usdCents: number;
  readonly cashBalance: number;
  readonly usdBalanceCents: number;
}

// ----- Portfolio -----------------------------------------------------------------------------------------------

export interface PortfolioDto {
  readonly asOf: GameMinute;
  readonly cash: number;
  readonly savings: {
    readonly balance: number;
    readonly annualRate: number;
    /** Interest accrued this month, paid (minus 10% WHT) at month end. */
    readonly accruedInterest: number;
  };
  readonly usd: {
    readonly balanceCents: number;
    readonly midRate: number;
    /** Naira per dollar when buying / selling at the desk. */
    readonly buyRate: number;
    readonly sellRate: number;
    readonly nairaValue: number;
    /** Dollars (incl. USDT) still buyable this game month under the FX allowance, in cents. */
    readonly allowanceRemainingCents: number;
  };
  readonly holdings: readonly HoldingDto[];
  readonly deposits: readonly DepositDto[];
  readonly ponzi: readonly PonziStakeDto[];
  readonly offers: readonly FixedIncomeOfferDto[];
  readonly totals: {
    readonly holdingsValue: number;
    readonly depositsValue: number;
    readonly usdValue: number;
    readonly savings: number;
    /** Everything above plus cash. */
    readonly total: number;
  };
}
