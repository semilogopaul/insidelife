import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { BILLBOARD_MAX_DAYS, BILLBOARD_MIN_DAYS, LINK_URL_MAX, type BillboardSlotId, type CreateCampaignRequest } from '@insidelife/shared';

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

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be YYYY-MM-DD' })
  readonly startDate: string;

  @IsInt()
  @Min(BILLBOARD_MIN_DAYS)
  @Max(BILLBOARD_MAX_DAYS)
  readonly days: number;
}

/** Multipart text fields of `POST /promotions/creatives`. */
export class UploadCreativeDto {
  @IsString()
  @Matches(SLOT_ID, { message: 'slotId must be a slot from GET /promotions/slots' })
  readonly slotId: BillboardSlotId;
}
