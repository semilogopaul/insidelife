import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  GAT_IDS,
  type AircraftFlightRequest,
  type AircraftLiveryRequest,
  type AircraftNameRequest,
  type AircraftPurchaseRequest,
  type AircraftRegistrationRequest,
  type GatId,
} from '@insidelife/shared';
import { IsIdempotencyKey } from '../../../common/decorators/idempotency-key.decorator.js';

export class AircraftPurchaseDto implements AircraftPurchaseRequest {
  @IsString()
  @MaxLength(40)
  readonly aircraftId: string;

  /** Remote purchases: the terminal the ferry crew flies it to. */
  @IsOptional()
  @IsIn(GAT_IDS)
  readonly deliverTo?: GatId;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  readonly name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  readonly registration?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  readonly liveryBase?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  readonly liveryAccent?: string;

  @IsIdempotencyKey()
  readonly idempotencyKey?: string;
}

export class AircraftLiveryDto implements AircraftLiveryRequest {
  @IsString()
  @MaxLength(24)
  readonly base: string;

  @IsString()
  @MaxLength(24)
  readonly accent: string;

  @IsIdempotencyKey()
  readonly idempotencyKey?: string;
}

export class AircraftNameDto implements AircraftNameRequest {
  @IsString()
  @MaxLength(40)
  readonly name: string;

  @IsIdempotencyKey()
  readonly idempotencyKey?: string;
}

export class AircraftRegistrationDto implements AircraftRegistrationRequest {
  @IsString()
  @MaxLength(12)
  readonly registration: string;

  @IsIdempotencyKey()
  readonly idempotencyKey?: string;
}

export class AircraftFlightDto implements AircraftFlightRequest {
  @IsIn(GAT_IDS)
  readonly destination: GatId;

  @IsIdempotencyKey()
  readonly idempotencyKey?: string;
}

/** Bare "tap once" body for commands without parameters. */
export class TapOnceDto {
  @IsIdempotencyKey()
  readonly idempotencyKey?: string;
}
