import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsString, IsUUID, Matches, MaxLength, Min, ValidateNested } from 'class-validator';
import { AD_VIEW_BATCH_MAX, type AdViewReport, type TrackClickRequest, type TrackImpressionsRequest, type TrackPlayRequest, type TrackViewsRequest } from '@insidelife/shared';

export class AdViewReportDto implements AdViewReport {
  @IsString()
  @Matches(/^[a-z0-9-]{2,32}$/)
  readonly slotId: string;

  @IsUUID('all')
  readonly campaignId: string;

  /** Server-clock epoch ms. */
  @IsInt()
  @Min(0)
  readonly seenAt: number;
}

export class TrackViewsDto implements TrackViewsRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(AD_VIEW_BATCH_MAX)
  @ValidateNested({ each: true })
  @Type(() => AdViewReportDto)
  readonly views: AdViewReportDto[];
}

/** @deprecated No longer counted; kept so older clients get a 204 instead of an error. */
export class TrackImpressionsDto implements TrackImpressionsRequest {
  @IsArray()
  @ArrayMaxSize(32)
  readonly campaignIds: string[];
}

export class TrackClickDto implements TrackClickRequest {
  @IsUUID('all')
  readonly campaignId: string;
}

/** @deprecated Plays are counted by the server from its own schedule. */
export class TrackPlayDto implements TrackPlayRequest {
  @IsUUID('all')
  readonly trackId: string;

  @IsString()
  @MaxLength(64)
  readonly venueId: string;
}

export class ClubRotationQueryDto {
  @IsString()
  @MaxLength(64)
  readonly venueId: string;
}
