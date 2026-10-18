import { IsString, MaxLength } from 'class-validator';
import type { VehicleShipmentRequest } from '@insidelife/shared';

export class VehicleShipmentDto implements VehicleShipmentRequest {
  @IsString()
  @MaxLength(64)
  readonly idempotencyKey: string;
}
