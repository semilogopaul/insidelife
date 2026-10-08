import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { INTERACTION_TYPES, WEDDING_TIERS, type InteractionRequest, type InteractionType, type WeddingTier } from '@insidelife/shared';

export class InteractionDto implements InteractionRequest {
  @IsIn(INTERACTION_TYPES)
  readonly type: InteractionType;

  /** Gift or ring value (₦). Ranges per interaction are enforced by the game rules. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  readonly amount?: number;

  @IsOptional()
  @IsIn(WEDDING_TIERS)
  readonly tier?: WeddingTier;
}
