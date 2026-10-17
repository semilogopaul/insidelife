import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import {
  DECOR_MAX_PER_PURCHASE,
  type DecorPlaceRequest,
  type DecorPurchaseRequest,
  type DecorRecolourRequest,
  type DecorWall,
} from '@insidelife/shared';
import { IsIdempotencyKey } from '../../../common/decorators/idempotency-key.decorator.js';

export class DecorPurchaseDto implements DecorPurchaseRequest {
  @IsString()
  @MaxLength(40)
  readonly itemId: string;

  @IsString()
  @MaxLength(24)
  readonly variant: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(DECOR_MAX_PER_PURCHASE)
  readonly quantity?: number;

  @IsIdempotencyKey()
  readonly idempotencyKey?: string;
}

export class DecorPlaceDto implements DecorPlaceRequest {
  @IsString()
  @MaxLength(24)
  readonly templateId: string;

  @IsString()
  @MaxLength(24)
  readonly roomId: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-30)
  @Max(30)
  readonly x: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-30)
  @Max(30)
  readonly z: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-1)
  @Max(10)
  readonly y?: number;

  @IsInt()
  @Min(-720)
  @Max(720)
  readonly rot: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(['back', 'left'])
  readonly wall?: DecorWall | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  readonly onId?: string | null;
}

export class DecorRecolourDto implements DecorRecolourRequest {
  @IsString()
  @MaxLength(24)
  readonly variant: string;

  @IsIdempotencyKey()
  readonly idempotencyKey?: string;
}
