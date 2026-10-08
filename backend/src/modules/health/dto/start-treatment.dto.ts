import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { StartTreatmentRequest } from '@insidelife/shared';

export class StartTreatmentDto implements StartTreatmentRequest {
  /** A condition's `id` from GET /v1/health (or its catalog id once diagnosed, or `pregnancy` for antenatal care). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  readonly conditionId: string;
}
