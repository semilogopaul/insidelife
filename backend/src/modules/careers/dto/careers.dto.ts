import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { CITY_IDS, type CityId, type RequestLeaveRequest } from '@insidelife/shared';

/** Longest single leave booking (game days). */
export const MAX_LEAVE_BOOKING_DAYS = 30;

export class JobParamsDto {
  @Matches(/^[a-z0-9-]{2,48}$/, { message: 'Unknown job' })
  readonly id: string;
}

export class JobBoardQueryDto {
  @IsOptional()
  @IsIn(CITY_IDS)
  readonly cityId?: CityId;
}

export class RequestLeaveDto implements RequestLeaveRequest {
  @IsInt()
  @Min(1)
  @Max(MAX_LEAVE_BOOKING_DAYS)
  readonly days: number;
}
