import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Matches } from 'class-validator';
import type { ChatMediaKind, UploadChatMediaFields } from '@insidelife/shared';

const MEDIA_KINDS: readonly ChatMediaKind[] = ['voice', 'image'];

/** Multipart text field of `POST /chat/dms/:channel/media`. */
export class UploadChatMediaDto implements UploadChatMediaFields {
  @IsIn(MEDIA_KINDS)
  readonly kind: ChatMediaKind;
}

/** Signed media link query (`GET /chat/media/:id?exp=…&sig=…`). */
export class MediaLinkQueryDto {
  @Type(() => Number)
  @IsInt()
  readonly exp: number;

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  readonly sig: string;
}
