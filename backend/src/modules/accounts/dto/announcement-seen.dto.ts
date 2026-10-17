import { IsIn } from 'class-validator';
import { ANNOUNCEMENT_IDS, type AnnouncementSeenRequest } from '@insidelife/shared';

export class AnnouncementSeenDto implements AnnouncementSeenRequest {
  @IsIn(ANNOUNCEMENT_IDS)
  readonly id: string;
}
