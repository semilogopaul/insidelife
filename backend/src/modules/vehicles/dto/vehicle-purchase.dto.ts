import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { VehiclePurchaseRequest } from '@insidelife/shared';

export class VehiclePurchaseDto implements VehiclePurchaseRequest {
  @IsString()
  @MaxLength(64)
  readonly vehicleId: string;

  /** Paint id from the vehicle's `paints` (defaults to its `defaultPaint`). */
  @IsOptional()
  @IsString()
  @MaxLength(24)
  readonly colour?: string;
}
