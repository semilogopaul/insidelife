import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { StartActionRequest } from '@insidelife/shared';

export class StartActionDto implements StartActionRequest {
  @IsString()
  @MaxLength(48)
  readonly actionId: string;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(24 * 60)
  readonly durationMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  readonly targetId?: string;
}
