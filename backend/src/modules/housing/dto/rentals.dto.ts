import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import {
  CITY_IDS,
  DISTRICT_IDS,
  HOUSING_TYPE_IDS,
  type CityId,
  type DistrictId,
  type HousingTypeId,
  type MoveHomeRequest,
  type RentalListingsQuery,
  type SignLeaseRequest,
} from '@insidelife/shared';
import { IsIdempotencyKey } from '../../../common/decorators/idempotency-key.decorator.js';

export class ListingsQueryDto implements RentalListingsQuery {
  @IsOptional()
  @IsIn(DISTRICT_IDS)
  readonly districtId?: DistrictId;

  @IsOptional()
  @IsIn(CITY_IDS)
  readonly cityId?: CityId;

  @IsOptional()
  @IsIn(HOUSING_TYPE_IDS)
  readonly type?: HousingTypeId;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000_000)
  readonly maxRent?: number;
}

export class SignLeaseDto implements SignLeaseRequest {
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z-]+\.[a-z-]+\.\d{1,7}\.\d{1,2}$/, { message: 'listingId must come from the listings' })
  readonly listingId: string;
  @IsIdempotencyKey()
  readonly idempotencyKey?: string;
}

export class MoveHomeDto implements MoveHomeRequest {
  @IsString()
  @Matches(/^(family|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i, { message: 'to must be "family" or one of your property ids' })
  readonly to: string;
}
