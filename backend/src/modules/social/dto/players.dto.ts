import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { LEADERBOARD_BOARDS, PROFILE_LOCATION_VISIBILITY, type LeaderboardBoardId, type ProfileLocationVisibility, type UpdateSocialPrivacyRequest } from '@insidelife/shared';

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
