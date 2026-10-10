import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { AD_MAX_WEEKS, CLUB_PLAY_PRODUCT_IDS, type ClubPlayProductId, type CreateClubOrderRequest, type UploadTrackFields } from '@insidelife/shared';
import { PaymentChoiceDto } from '../../../common/http/payment-choice.dto.js';

/** Multipart text fields of `POST /promotions/tracks` (cleaned and bounded again in TracksService). */
export class UploadTrackDto implements UploadTrackFields {
  @IsString()
  @MaxLength(120)
  readonly artistName: string;

  @IsString()
  @MaxLength(160)
  readonly title: string;
}

export class CreateClubOrderDto extends PaymentChoiceDto implements CreateClubOrderRequest {
  @IsIn(CLUB_PLAY_PRODUCT_IDS)
  readonly productId: ClubPlayProductId;

  /** Consecutive weeks (default 1). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(AD_MAX_WEEKS)
  readonly weeks?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  readonly clubs?: string[];

  /** The start date the artist was shown; the server refuses if the rotation's next free day moved later. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'expectedStartDate must be YYYY-MM-DD' })
  readonly expectedStartDate?: string;

  /** The price the artist was shown, in kobo; a re-priced song is refused with PRICE_CHANGED. */
  @IsOptional()
  @IsInt()
  @Min(0)
  readonly expectedPriceKobo?: number;
}
