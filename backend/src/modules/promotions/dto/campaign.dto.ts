import { IsIn, IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { BILLBOARD_MAX_DAYS, BILLBOARD_MIN_DAYS, BILLBOARD_SLOT_IDS, LINK_URL_MAX, type BillboardSlotId, type CreateCampaignRequest } from '@insidelife/shared';

/** Shape checks only; dates, link safety, text cleaning and capacity are domain rules in CampaignsService. */
export class CreateCampaignDto implements CreateCampaignRequest {
  @IsIn(BILLBOARD_SLOT_IDS)
  readonly slotId: BillboardSlotId;

  @IsString()
  @Matches(/^billboards\/[0-9a-f-]{36}\.webp$/, { message: 'creativeKey must come from POST /promotions/creatives' })
  readonly creativeKey: string;

  @IsString()
  @MaxLength(200)
  readonly title: string;

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
  @IsIn(BILLBOARD_SLOT_IDS)
  readonly slotId: BillboardSlotId;
}
