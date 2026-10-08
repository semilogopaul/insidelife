import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { PLAYER_PROPOSAL_KINDS, RING_LIMITS, type CreateProposalRequest, type PlayerProposalKind } from '@insidelife/shared';

export class CreateProposalDto implements CreateProposalRequest {
  @IsIn(PLAYER_PROPOSAL_KINDS)
  readonly kind: PlayerProposalKind;

  @IsOptional()
  @IsInt()
  @Min(RING_LIMITS.min)
  @Max(RING_LIMITS.max)
  readonly ringValue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  readonly message?: string;
}

export class HandleParamDto {
  @IsString()
  @Matches(/^@?[a-zA-Z0-9_]{3,20}$/, { message: 'Invalid handle' })
  readonly handle: string;
}
