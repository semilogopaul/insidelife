import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
import { HOTEL_MAX_NIGHTS, type HotelBookingRequest } from '@insidelife/shared';

export class HotelBookingDto implements HotelBookingRequest {
  @IsString()
  @MaxLength(64)
  readonly venueId: string;

  @IsInt()
  @Min(1)
  @Max(HOTEL_MAX_NIGHTS)
  readonly nights: number;

  /** One key per press: a retry never pays twice. */
  @IsString()
  @MaxLength(64)
  readonly idempotencyKey: string;
}

export class HotelCheckoutDto {
  @IsString()
  @MaxLength(64)
  readonly idempotencyKey: string;
}
