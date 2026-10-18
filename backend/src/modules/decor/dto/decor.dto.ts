import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import {
  DECOR_MAX_PER_PURCHASE,
  type DecorArrangeRequest,
  type DecorPlaceRequest,
  type DecorPurchaseRequest,
  type DecorRecolourRequest,
  type DecorReplaceMode,
  type DecorReplaceRequest,
  type DecorWall,
} from '@insidelife/shared';
import { IsIdempotencyKey } from '../../../common/decorators/idempotency-key.decorator.js';

/** Where bought pieces go straight away: the room of your home you are in. */
export class DecorPurchasePlaceDto {
  @IsString()
  @MaxLength(24)
  readonly templateId: string;

  @IsString()
  @MaxLength(24)
  readonly roomId: string;
}

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

  @IsOptional()
  @ValidateNested()
  @Type(() => DecorPurchasePlaceDto)
  readonly place?: DecorPurchasePlaceDto;

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

export class DecorSellDto {
  @IsIdempotencyKey()
  readonly idempotencyKey?: string;
}

export class DecorReplaceDto implements DecorReplaceRequest {
  @IsUUID()
  readonly oldId: string;

  @IsIn(['store', 'sell'])
  readonly mode: DecorReplaceMode;

  @IsIdempotencyKey()
  readonly idempotencyKey?: string;
}

export class DecorArrangeDto implements DecorArrangeRequest {
  @IsOptional()
  @IsString()
  @MaxLength(24)
  readonly roomId?: string;
}
