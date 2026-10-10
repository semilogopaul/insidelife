import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  BET_SELECTION_IDS,
  BETTING_RULES,
  MATCH_ID_PATTERN,
  type BetLegRequest,
  type BetQuoteRequest,
  type BetSelectionId,
  type ConfirmBirthDateRequest,
  type PlaceBetRequest,
  type SelfExclusionDays,
  type SelfExclusionRequest,
  type UpdateBettingLimitsRequest,
} from '@insidelife/shared';
import { IDEMPOTENCY_KEY_PATTERN } from '../../../common/decorators/idempotency-key.decorator.js';

export class BetLegDto implements BetLegRequest {
  @IsString()
  @Matches(MATCH_ID_PATTERN, { message: 'matchId is not a Lagos League match' })
  readonly matchId: string;

  @IsIn(BET_SELECTION_IDS)
  readonly selection: BetSelectionId;
}

export class BetQuoteDto implements BetQuoteRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BETTING_RULES.maxLegs)
  @ValidateNested({ each: true })
  @Type(() => BetLegDto)
  readonly legs: BetLegDto[];

  /** Whole game naira; the rules give a friendly message for too little or too much. */
  @IsInt()
  @Min(0)
  @Max(1_000_000_000_000)
  readonly stake: number;
}

/** Placing a slip is tap-once: the key is required, and a retry with it gets the first answer back. */
export class PlaceBetDto extends BetQuoteDto implements PlaceBetRequest {
  @IsString()
  @Matches(IDEMPOTENCY_KEY_PATTERN, { message: 'idempotencyKey must be 8-64 letters, numbers, - or _' })
  readonly idempotencyKey: string;
}

export class ResultsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999_999_999)
  readonly round?: number;
}

export class UpdateBettingLimitsDto implements UpdateBettingLimitsRequest {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000_000_000)
  readonly dailyLossLimit?: number;

  @IsOptional()
  @IsIn(BETTING_RULES.realityCheckMinutes)
  readonly realityCheckMinutes?: number;
}

export class SelfExclusionDto implements SelfExclusionRequest {
  @IsIn(BETTING_RULES.selfExclusionDays)
  readonly days: SelfExclusionDays;
}

export class ConfirmBirthDateDto implements ConfirmBirthDateRequest {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Enter your date of birth as YYYY-MM-DD' })
  readonly birthDate: string;
}
