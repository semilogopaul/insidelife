import {
  DEPOSIT_PRODUCTS,
  MINUTES_PER_DAY,
  findInstrument,
  positionValue,
  simpleInterest,
  type DepositDto,
  type GameMinute,
  type HoldingDto,
  type PonziStakeDto,
  type TradeDto,
} from '@insidelife/shared';
import type { InvestmentDepositEntity } from './entities/deposit.entity.js';
import type { InvestmentHoldingEntity } from './entities/holding.entity.js';
import type { PonziStakeEntity } from './entities/ponzi-stake.entity.js';
import { FX_INSTRUMENT_ID, type InvestmentTradeEntity } from './entities/trade.entity.js';
import { fromMicroUnits } from './trading-math.js';

/** Unit prices keep their kobo ("₦239.22"); sub-naira memecoin prices keep 4 significant digits. */
export function formatPrice(price: number): string {
  if (price < 1) return `₦${Number(price.toPrecision(4))}`;
  return `₦${price.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function holdingDto(holding: InvestmentHoldingEntity, price: number): HoldingDto {
  const instrument = findInstrument(holding.instrumentId);
  const value = positionValue(holding.microUnits, price);
  return {
    instrumentId: holding.instrumentId,
    name: instrument?.name ?? holding.instrumentId,
    kind: instrument?.kind ?? 'stock',
    units: fromMicroUnits(holding.microUnits),
    price,
    value,
    costBasis: holding.costBasis,
    unrealizedGain: value - holding.costBasis,
  };
}

export function tradeDto(trade: InvestmentTradeEntity): TradeDto {
  return {
    id: trade.id,
    instrumentId: trade.instrumentId,
    side: trade.side,
    units: trade.instrumentId === FX_INSTRUMENT_ID ? trade.quantity / 100 : fromMicroUnits(trade.quantity),
    price: trade.price,
    gross: trade.gross,
    fee: trade.fee,
    realizedGain: trade.realizedGain,
    gameMinute: trade.gameMinute,
    createdAt: trade.createdAt.toISOString(),
  };
}

/** Whole game days a fixed-tenor deposit has run (capped at its tenor). */
export function elapsedDays(deposit: Pick<InvestmentDepositEntity, 'startedAt' | 'tenorDays'>, now: GameMinute): number {
  const days = Math.max(0, Math.floor((now - deposit.startedAt) / MINUTES_PER_DAY));
  return deposit.tenorDays === null ? days : Math.min(days, deposit.tenorDays);
}

/** Gross interest earned so far (fixed tenor: linear accrual; money-market: stored daily accrual). */
export function accruedInterest(deposit: InvestmentDepositEntity, now: GameMinute): number {
  if (deposit.status !== 'active') return 0;
  if (deposit.tenorDays === null) return Math.floor(deposit.accrued);
  return Math.floor(simpleInterest(deposit.principal, deposit.annualRate, elapsedDays(deposit, now)));
}

export function interestAtMaturity(deposit: Pick<InvestmentDepositEntity, 'principal' | 'annualRate' | 'tenorDays'>): number | null {
  return deposit.tenorDays === null ? null : Math.round(simpleInterest(deposit.principal, deposit.annualRate, deposit.tenorDays));
}

export function earlyBreakPenalty(deposit: InvestmentDepositEntity, now: GameMinute): number {
  if (deposit.status !== 'active' || deposit.maturesAt === null || now >= deposit.maturesAt) return 0;
  return Math.round(deposit.principal * DEPOSIT_PRODUCTS[deposit.product].earlyBreakPenaltyRate);
}

export function depositDto(deposit: InvestmentDepositEntity, now: GameMinute): DepositDto {
  return {
    id: deposit.id,
    product: deposit.product,
    label: DEPOSIT_PRODUCTS[deposit.product].label,
    principal: deposit.principal,
    annualRate: deposit.annualRate,
    tenorDays: deposit.tenorDays,
    startedAt: deposit.startedAt,
    maturesAt: deposit.maturesAt,
    accruedInterest: accruedInterest(deposit, now),
    interestAtMaturity: interestAtMaturity(deposit),
    status: deposit.status,
    earlyBreakPenalty: earlyBreakPenalty(deposit, now),
  };
}

export function ponziDto(stake: PonziStakeEntity): PonziStakeDto {
  return {
    id: stake.id,
    scheme: stake.scheme,
    amount: stake.amount,
    promisedPayout: stake.promisedPayout,
    payoutAt: stake.payoutAt,
    status: stake.status,
  };
}
