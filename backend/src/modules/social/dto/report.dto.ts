import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { PLAYER_REPORT_REASONS, REPORT_RULES, type PlayerReportReason, type ReportPlayerRequest } from '@insidelife/shared';
import { HANDLE_PATTERN } from './handle.dto.js';

export class ReportPlayerDto implements ReportPlayerRequest {
  @IsString()
  @Matches(HANDLE_PATTERN, { message: 'Handles are 3-20 letters, numbers or _' })
  readonly handle: string;

  @IsIn(PLAYER_REPORT_REASONS)
  readonly reason: PlayerReportReason;

  @IsOptional()
  @IsUUID()
  readonly messageId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(REPORT_RULES.detailsMaxLength)
  readonly details?: string;

  @IsOptional()
  @IsBoolean()
  readonly alsoBlock?: boolean;
}
