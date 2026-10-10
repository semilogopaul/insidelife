import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import {
  DISTRICT_IDS,
  type BuyHouseRequest,
  type DistrictId,
  type HouseListingsQuery,
} from '@insidelife/shared';
import { IsIdempotencyKey } from '../../../common/decorators/idempotency-key.decorator.js';

export class HouseListingsQueryDto implements HouseListingsQuery {
  @IsOptional()
  @IsIn(DISTRICT_IDS)
  readonly districtId?: DistrictId;
}

export class BuyHouseDto implements BuyHouseRequest {
  @IsString()
  @MaxLength(64)
  @Matches(/^house\.[a-z-]+\.\d{1,7}\.\d{1,2}$/, { message: 'listingId must come from the houses for sale' })
  readonly listingId: string;
  @IsIdempotencyKey()
  readonly idempotencyKey?: string;
}
