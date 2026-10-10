import { IsString, MaxLength } from 'class-validator';
import type { VehicleServiceRequest } from '@insidelife/shared';

/** Roadside mechanic and jerrycan orders: one key per press, so a retry never pays twice. */
export class VehicleServiceDto implements VehicleServiceRequest {
  @IsString()
  @MaxLength(64)
  readonly idempotencyKey: string;
}
