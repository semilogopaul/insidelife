import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import {
  PARTY_DRESS_CODES,
  PARTY_RULES,
  PARTY_TIER_IDS,
  SPRAY_RULES,
  type CreatePartyRequest,
  type PartyDressCode,
  type PartyQuoteRequest,
  type PartyTierId,
  type SprayRequest,
  type VenueSprayRequest,
} from '@insidelife/shared';
import { HANDLE_PATTERN } from './handle.dto.js';

/** Query string (`?venueId=eko-hotel&tier=owambe&durationHours=4&startsInMinutes=120`). */
export class PartyQuoteQueryDto implements PartyQuoteRequest {
  @IsString()
  @MaxLength(64)
  readonly venueId: string;

  @IsIn(PARTY_TIER_IDS)
  readonly tier: PartyTierId;

  @Type(() => Number)
  @IsInt()
  @Min(PARTY_RULES.minDurationHours)
  @Max(PARTY_RULES.maxDurationHours)
  readonly durationHours: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(PARTY_RULES.maxLeadMinutes)
  readonly startsInMinutes?: number;
}

export class CreatePartyDto implements CreatePartyRequest {
  @IsString()
  @MaxLength(64)
  readonly venueId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(PARTY_RULES.titleMaxLength)
  @Matches(/^[^<>]+$/, { message: 'Title has characters we can’t print on the IV' })
  readonly title: string;

  @IsIn(PARTY_TIER_IDS)
  readonly tier: PartyTierId;

  @IsInt()
  @Min(PARTY_RULES.minDurationHours)
  @Max(PARTY_RULES.maxDurationHours)
  readonly durationHours: number;

  @IsInt()
  @Min(0)
  @Max(PARTY_RULES.maxLeadMinutes)
  readonly startsInMinutes: number;

  @IsOptional()
  @IsIn(PARTY_DRESS_CODES)
  readonly dressCode?: PartyDressCode;
}

export class SprayDto implements SprayRequest {
  @IsString()
  @Matches(HANDLE_PATTERN, { message: 'Handles are 3-20 letters, numbers or _' })
  readonly toHandle: string;

  /** Whole notes are validated by the shared spray rules (multiples of ₦500). */
  @IsInt()
  @Min(SPRAY_RULES.minAmount)
  @Max(SPRAY_RULES.maxPerSpray)
  readonly amount: number;

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,64}$/, { message: 'idempotencyKey must be 8-64 letters, numbers, - or _' })
  readonly idempotencyKey: string;
}

export class VenueSprayDto implements VenueSprayRequest {
  /** Null sprays the DJ. */
  @IsOptional()
  @IsString()
  @Matches(HANDLE_PATTERN, { message: 'Handles are 3-20 letters, numbers or _' })
  readonly toHandle: string | null;

  @IsInt()
  @Min(SPRAY_RULES.minAmount)
  @Max(SPRAY_RULES.maxPerSpray)
  readonly amount: number;

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,64}$/, { message: 'idempotencyKey must be 8-64 letters, numbers, - or _' })
  readonly idempotencyKey: string;
}
