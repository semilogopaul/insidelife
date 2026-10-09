import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { TREATMENT_METHODS, type StartTreatmentRequest, type TreatmentMethod } from '@insidelife/shared';

export class StartTreatmentDto implements StartTreatmentRequest {
  /** A condition's `id` from GET /v1/health (or its catalog id once diagnosed, or `pregnancy` for antenatal care). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  readonly conditionId: string;

  /** Tablets (default) or an injection (hospitals only). */
  @IsOptional()
  @IsIn(TREATMENT_METHODS)
  readonly method?: TreatmentMethod;
}
