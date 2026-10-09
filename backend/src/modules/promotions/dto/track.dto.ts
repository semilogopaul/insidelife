import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { CLUB_PLAY_PRODUCT_IDS, type ClubPlayProductId, type CreateClubOrderRequest, type UploadTrackFields } from '@insidelife/shared';

/** Multipart text fields of `POST /promotions/tracks` (cleaned and bounded again in TracksService). */
export class UploadTrackDto implements UploadTrackFields {
  @IsString()
  @MaxLength(120)
  readonly artistName: string;

  @IsString()
  @MaxLength(160)
  readonly title: string;
}

export class CreateClubOrderDto implements CreateClubOrderRequest {
  @IsIn(CLUB_PLAY_PRODUCT_IDS)
  readonly productId: ClubPlayProductId;

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
}
