import type { InviteVisitRequest } from '@insidelife/shared';
import { IsString, Matches } from 'class-validator';

export class InviteVisitDto implements InviteVisitRequest {
  @IsString()
  @Matches(/^@?[A-Za-z0-9_]{3,20}$/, { message: 'Handles are 3-20 letters, numbers or _' })
  readonly handle: string;
}
