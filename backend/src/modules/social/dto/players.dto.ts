import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import {
  FOBES_LIST_IDS,
  FOBES_MAX_PAGE,
  LEADERBOARD_BOARDS,
  PROFILE_LOCATION_VISIBILITY,
  type FobesListId,
  type LeaderboardBoardId,
  type ProfileLocationVisibility,
  type UpdateSocialPrivacyRequest,
} from '@insidelife/shared';

export class PlayerSearchQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  readonly query: string;
}

export class UpdatePrivacyDto implements UpdateSocialPrivacyRequest {
  @IsOptional()
  @IsBoolean()
  readonly showExactWealth?: boolean;

  @IsOptional()
  @IsIn(PROFILE_LOCATION_VISIBILITY)
  readonly locationVisibility?: ProfileLocationVisibility;
}

export class LeaderboardParamsDto {
  @IsIn(LEADERBOARD_BOARDS)
  readonly board: LeaderboardBoardId;
}

export class VenueParamsDto {
  @IsString()
  @MaxLength(64)
  readonly venueId: string;
}

export class FobesListParamsDto {
  @IsIn(FOBES_LIST_IDS)
  readonly list: FobesListId;
}

export class FobesPageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(FOBES_MAX_PAGE)
  readonly page?: number;
}
