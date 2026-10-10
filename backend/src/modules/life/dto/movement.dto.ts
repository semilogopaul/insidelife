import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import {
  MIN_FUEL_PURCHASE_LITRES,
  TRANSPORT_MODES,
  type EnterLocationRequest,
  type FuelPurchaseRequest,
  type MechanicVisitRequest,
  type MovementHeartbeatRequest,
  type TransportMode,
  type TravelRequest,
  type WorldPoint,
} from '@insidelife/shared';

export class WorldPointDto implements WorldPoint {
  @IsNumber()
  @Min(-100_000)
  @Max(100_000)
  readonly x: number;

  @IsNumber()
  @Min(-100_000)
  @Max(100_000)
  readonly z: number;
}

export class TravelDto implements TravelRequest {
  @IsString()
  @MaxLength(64)
  readonly destinationId: string;

  @IsIn(TRANSPORT_MODES)
  readonly mode: TransportMode;
}

export class EnterLocationDto implements EnterLocationRequest {
  @IsString()
  @MaxLength(64)
  readonly locationId: string;

  @ValidateNested()
  @Type(() => WorldPointDto)
  readonly position: WorldPointDto;

  @IsIn(['walk', 'car'])
  readonly mode: 'walk' | 'car';
}

export class HeartbeatDto implements MovementHeartbeatRequest {
  @ValidateNested()
  @Type(() => WorldPointDto)
  readonly position: WorldPointDto;

  @IsIn(['walk', 'car'])
  readonly mode: 'walk' | 'car';

  @IsOptional()
  @IsNumber()
  @Min(-Math.PI * 4)
  @Max(Math.PI * 4)
  readonly heading?: number;

  /** m/s lost in hard hits since the last beat (crash damage; capped server-side too). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000)
  readonly bumps?: number;
}

export class FuelPurchaseDto implements FuelPurchaseRequest {
  @IsString()
  @MaxLength(64)
  readonly stationId: string;

  @ValidateNested()
  @Type(() => WorldPointDto)
  readonly position: WorldPointDto;

  /** Omitted: fill the tank. */
  @IsOptional()
  @IsNumber()
  @Min(MIN_FUEL_PURCHASE_LITRES)
  @Max(200)
  readonly litres?: number;

  @IsString()
  @MaxLength(64)
  readonly idempotencyKey: string;
}

export class MechanicVisitDto implements MechanicVisitRequest {
  @IsString()
  @MaxLength(64)
  readonly workshopId: string;

  @ValidateNested()
  @Type(() => WorldPointDto)
  readonly position: WorldPointDto;

  @IsString()
  @MaxLength(64)
  readonly idempotencyKey: string;
}

export class QuoteQueryDto {
  @IsString()
  @MaxLength(64)
  readonly destinationId: string;
}
