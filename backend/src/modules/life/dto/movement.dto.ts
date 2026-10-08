import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { TRANSPORT_MODES, type EnterLocationRequest, type MovementHeartbeatRequest, type TransportMode, type TravelRequest, type WorldPoint } from '@insidelife/shared';

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
}

export class QuoteQueryDto {
  @IsString()
  @MaxLength(64)
  readonly destinationId: string;
}
