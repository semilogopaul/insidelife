import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PLAYER_REPORT_REASONS, type PlayerReportReason, type PlayerReportStatus } from '@insidelife/shared';
import { AdminListQueryDto } from '../../common/list-query.dto.js';

export const REPORT_STATUS_FILTERS = ['all', 'open', 'reviewing', 'actioned', 'dismissed', 'closed'] as const;
export type ReportStatusFilter = (typeof REPORT_STATUS_FILTERS)[number];

/** `GET /v1/admin/reports`. `from`/`to` filter when the report was filed. */
export class ReportsQueryDto extends AdminListQueryDto {
  @IsOptional()
  @IsIn(REPORT_STATUS_FILTERS)
  readonly status?: ReportStatusFilter;

  @IsOptional()
  @IsIn(PLAYER_REPORT_REASONS)
  readonly reason?: PlayerReportReason;

  @IsOptional()
  @IsIn(['createdAt', 'resolvedAt'])
  readonly sort?: 'createdAt' | 'resolvedAt';
}

export class ReportDecisionDto {
  @IsString()
  @MinLength(3, { message: 'Add a short note (at least 3 characters)' })
  @MaxLength(1000)
  readonly note: string;
}

export interface AdminReportRowDto {
  readonly id: string;
  readonly reason: PlayerReportReason;
  readonly status: PlayerReportStatus;
  readonly details: string | null;
  readonly sameLocation: boolean | null;
  readonly messageId: string | null;
  readonly createdAt: string;
  readonly reporter: { readonly characterId: string; readonly userId: string | null; readonly handle: string | null };
  readonly target: { readonly characterId: string; readonly userId: string | null; readonly handle: string | null; readonly name: string | null };
  /** Other open reports against the same player. */
  readonly openAgainstTarget: number;
  readonly resolvedAt: string | null;
  readonly resolvedBy: string | null;
  readonly resolutionNote: string | null;
}
