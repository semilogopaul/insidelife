import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { NIGHT_OUT_ITEM_IDS, type NightOutItemId, type NightOutRequest } from '@insidelife/shared';
import { HANDLE_PATTERN } from './handle.dto.js';

/** `POST /venues/:venueId/moments`: a bottle for someone here, a DJ shoutout or an experience. */
export class NightOutRequestDto implements NightOutRequest {
  @IsIn(NIGHT_OUT_ITEM_IDS)
  readonly itemId: NightOutItemId;

  /** Bottles: who it's for (required). A birthday: someone here, or empty for you. */
  @IsOptional()
  @IsString()
  @Matches(HANDLE_PATTERN, { message: 'Handles are 3-20 letters, numbers or _' })
  readonly toHandle?: string | null;

  /** Shoutouts: the rules (60 characters, no links, no bad words) give a friendly refusal. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly message?: string | null;

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,64}$/, { message: 'idempotencyKey must be 8-64 letters, numbers, - or _' })
  readonly idempotencyKey: string;
}
