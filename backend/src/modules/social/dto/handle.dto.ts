import { IsString, Matches } from 'class-validator';
import type { BlockPlayerRequest, SendFriendRequestRequest } from '@insidelife/shared';

/** "@tolu_b" or "tolu_b" (normalised server-side). */
export const HANDLE_PATTERN = /^@?[A-Za-z0-9_]{3,20}$/;

export class HandleDto implements SendFriendRequestRequest, BlockPlayerRequest {
  @IsString()
  @Matches(HANDLE_PATTERN, { message: 'Handles are 3-20 letters, numbers or _' })
  readonly handle: string;
}
