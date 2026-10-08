import { IsInt, IsOptional, Max, Min } from 'class-validator';
import type { InventorySaleRequest } from '@insidelife/shared';

export class InventorySaleDto implements InventorySaleRequest {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  readonly quantity?: number;
}
