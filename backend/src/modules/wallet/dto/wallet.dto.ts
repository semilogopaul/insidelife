import { Type } from 'class-transformer';
import { IsIn, IsISO8601, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import {
  MAX_SAFE_NAIRA,
  MAX_SINGLE_TRANSFER,
  MIN_TRANSFER,
  SAVINGS_TRANSFER_DIRECTIONS,
  type SavingsTransferDirection,
  type SavingsTransferRequest,
  type StatementQuery,
  type TransferRequest,
} from '@insidelife/shared';

/** Client idempotency keys: UUIDs or similar opaque tokens. */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

export class TransferDto implements TransferRequest {
  @IsString()
  @Matches(/^@?[A-Za-z0-9_]{3,20}$/, { message: 'toHandle must be a valid @handle' })
  readonly toHandle: string;

  @IsInt()
  @Min(MIN_TRANSFER)
  @Max(MAX_SINGLE_TRANSFER)
  readonly amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  readonly note?: string;

  @IsString()
  @Matches(IDEMPOTENCY_KEY_PATTERN, { message: 'idempotencyKey must be a UUID' })
  readonly idempotencyKey: string;
}

export class SavingsTransferDto implements SavingsTransferRequest {
  @IsIn(SAVINGS_TRANSFER_DIRECTIONS)
  readonly direction: SavingsTransferDirection;

  @IsInt()
  @Min(1)
  @Max(MAX_SAFE_NAIRA)
  readonly amount: number;

  @IsOptional()
  @IsString()
  @Matches(IDEMPOTENCY_KEY_PATTERN, { message: 'idempotencyKey must be a UUID' })
  readonly idempotencyKey?: string;
}

export class StatementQueryDto implements StatementQuery {
  @IsOptional()
  @IsISO8601({ strict: true })
  readonly cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  readonly limit?: number;
}
