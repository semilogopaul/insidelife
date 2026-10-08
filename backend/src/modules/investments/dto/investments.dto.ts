import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import {
  DEPOSIT_PRODUCT_IDS,
  FX_SIDES,
  MAX_ORDER_NAIRA,
  MAX_UNITS_PER_HOLDING,
  ORDER_SIDES,
  type CreateDepositRequest,
  type DepositProductId,
  type FxOrderRequest,
  type FxSide,
  type OrderSide,
  type PlaceOrderRequest,
  type PriceHistoryQuery,
} from '@insidelife/shared';

const IDEMPOTENCY_KEY = /^[A-Za-z0-9-]{8,64}$/;
const TENORS = [91, 182, 364] as const;

export class PlaceOrderDto implements PlaceOrderRequest {
  @IsString()
  @Matches(/^[A-Za-z]{2,16}$/, { message: 'instrumentId must be a ticker' })
  readonly instrumentId: string;

  @IsIn(ORDER_SIDES)
  readonly side: OrderSide;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_ORDER_NAIRA)
  readonly amountNaira?: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 6 })
  @Min(0.000001)
  @Max(MAX_UNITS_PER_HOLDING)
  readonly units?: number;

  @IsOptional()
  @Matches(IDEMPOTENCY_KEY, { message: 'idempotencyKey must be a UUID' })
  readonly idempotencyKey?: string;
}

export class CreateDepositDto implements CreateDepositRequest {
  @IsIn(DEPOSIT_PRODUCT_IDS)
  readonly product: DepositProductId;

  @IsOptional()
  @IsIn(TENORS)
  readonly tenorDays?: number;

  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  readonly amount: number;

  @IsOptional()
  @Matches(IDEMPOTENCY_KEY, { message: 'idempotencyKey must be a UUID' })
  readonly idempotencyKey?: string;
}

export class FxOrderDto implements FxOrderRequest {
  @IsIn(FX_SIDES)
  readonly side: FxSide;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_ORDER_NAIRA)
  readonly amountNaira?: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  readonly amountUsd?: number;

  @IsOptional()
  @Matches(IDEMPOTENCY_KEY, { message: 'idempotencyKey must be a UUID' })
  readonly idempotencyKey?: string;
}

export class PriceHistoryQueryDto implements PriceHistoryQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  readonly days?: number;
}

export class TradeHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  readonly limit?: number;
}
