import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { AD_MAX_WEEKS, LINK_URL_MAX, type BillboardSlotId, type CreateCampaignRequest } from '@insidelife/shared';

/** Slot ids are short kebab-case catalog keys (`findAdSlot` decides whether one exists and is for sale). */
const SLOT_ID = /^[a-z0-9-]{2,32}$/;

/** Shape checks only; dates, link safety, text cleaning and capacity are domain rules in CampaignsService. */
export class CreateCampaignDto implements CreateCampaignRequest {
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

  /** Consecutive 7-day blocks; the server picks the start (the slot's next free day). */
  @IsInt()
  @Min(1)
  @Max(AD_MAX_WEEKS)
  readonly weeks: number;

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
