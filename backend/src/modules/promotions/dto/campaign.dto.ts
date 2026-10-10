import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { AD_MAX_RUN_DAYS, AD_MAX_WEEKS, AD_SHORT_BLOCK_DAYS, LINK_URL_MAX, type BillboardSlotId, type CreateCampaignRequest } from '@insidelife/shared';
import { PaymentChoiceDto } from '../../../common/http/payment-choice.dto.js';

/** Slot ids are short kebab-case catalog keys (`findAdSlot` decides whether one exists and is for sale). */
const SLOT_ID = /^[a-z0-9-]{2,32}$/;

/** Shape checks only; dates, link safety, text cleaning and capacity are domain rules in CampaignsService. */
export class CreateCampaignDto extends PaymentChoiceDto implements CreateCampaignRequest {
  @IsString()
  @Matches(SLOT_ID, { message: 'slotId must be a slot from GET /promotions/slots' })
  readonly slotId: BillboardSlotId;

  @IsString()
  @Matches(/^billboards\/[0-9a-f-]{36}\.webp$/, { message: 'creativeKey must come from POST /promotions/creatives' })
  readonly creativeKey: string;

  @IsString()
  @MaxLength(200)
  readonly title: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly tagline?: string;

  @IsString()
  @MaxLength(LINK_URL_MAX + 100)
  readonly linkUrl: string;

  /** Consecutive blocks of the slot's block length (7 or 3 days); the server picks the start (its next free day). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(Math.floor(AD_MAX_RUN_DAYS / AD_SHORT_BLOCK_DAYS))
  readonly blocks?: number;

  /** Older clients: weeks, accepted on slots sold by the week. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(AD_MAX_WEEKS)
  readonly weeks?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'expectedStartDate must be YYYY-MM-DD' })
  readonly expectedStartDate?: string;

  /** The total the buyer was shown, in kobo; a re-priced slot is refused with PRICE_CHANGED. */
  @IsOptional()
  @IsInt()
  @Min(0)
  readonly expectedPriceKobo?: number;
}

/** Multipart text fields of `POST /promotions/creatives`. */
export class UploadCreativeDto {
  @IsString()
  @Matches(SLOT_ID, { message: 'slotId must be a slot from GET /promotions/slots' })
  readonly slotId: BillboardSlotId;
}
