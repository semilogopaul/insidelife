import { IsIn, IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import {
  CITY_IDS,
  FLIGHT_CABINS,
  FLIGHT_CHANNELS,
  type BookBusRequest,
  type BookFlightRequest,
  type ChangeFlightRequest,
  type CityId,
  type FlightCabin,
  type FlightChannel,
} from '@insidelife/shared';
import { IsIdempotencyKey } from '../../../common/decorators/idempotency-key.decorator.js';

export class BookFlightDto implements BookFlightRequest {
  @IsString()
  @MaxLength(64)
  @Matches(/^fl:\d+:[a-z]+:[a-z-]+:\d+$/)
  readonly flightId: string;

  @IsIn(FLIGHT_CABINS)
  readonly cabin: FlightCabin;

  @IsIn(FLIGHT_CHANNELS)
  readonly channel: FlightChannel;

  @IsIdempotencyKey()
  readonly idempotencyKey?: string;
}

export class ChangeFlightDto implements ChangeFlightRequest {
  @IsString()
  @MaxLength(64)
  @Matches(/^fl:\d+:[a-z]+:[a-z-]+:\d+$/)
  readonly flightId: string;

  @IsIdempotencyKey()
  readonly idempotencyKey?: string;
}

export class BookBusDto implements BookBusRequest {
  @IsIn(CITY_IDS)
  readonly toCity: CityId;

  @IsIdempotencyKey()
  readonly idempotencyKey?: string;
}

export class FlightSearchQueryDto {
  @IsIn(CITY_IDS)
  readonly from: CityId;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(13)
  readonly day: number;
}

export class BookingParamDto {
  @IsUUID()
  readonly id: string;
}
