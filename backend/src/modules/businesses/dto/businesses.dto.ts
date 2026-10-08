import { IsIn, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { BUSINESS_TYPES, DISTRICT_IDS, type DistrictId, type StartBusinessRequest } from '@insidelife/shared';

export class StartBusinessDto implements StartBusinessRequest {
  @IsIn(BUSINESS_TYPES.map((type) => type.id))
  readonly typeId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  @Matches(/^[\p{L}\p{N}][\p{L}\p{N} '’&.,-]*$/u, { message: 'Business name can use letters, numbers, spaces and & . , - ’' })
  readonly name: string;

  @IsIn(DISTRICT_IDS)
  readonly districtId: DistrictId;
}

export class BusinessParamsDto {
  @IsUUID()
  readonly id: string;
}
