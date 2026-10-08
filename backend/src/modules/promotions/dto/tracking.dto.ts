import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, IsUUID, MaxLength } from 'class-validator';
import type { TrackClickRequest, TrackImpressionsRequest, TrackPlayRequest } from '@insidelife/shared';

export class TrackImpressionsDto implements TrackImpressionsRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(32)
  @IsUUID('all', { each: true })
  readonly campaignIds: string[];
}

export class TrackClickDto implements TrackClickRequest {
  @IsUUID('all')
  readonly campaignId: string;
}

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
