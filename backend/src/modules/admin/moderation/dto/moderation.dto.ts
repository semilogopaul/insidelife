import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PROMOTION_STATUSES, type PromotionStatus } from '@insidelife/shared';
import { AdminListQueryDto } from '../../common/list-query.dto.js';

export const PROMOTION_TYPES = ['all', 'campaign', 'club-order'] as const;
export type PromotionTypeFilter = (typeof PROMOTION_TYPES)[number];

export const PROMOTION_SORTS = ['createdAt', 'startDate', 'amount', 'paidAt', 'reviewedAt'] as const;
export type PromotionSort = (typeof PROMOTION_SORTS)[number];

/** `GET /v1/admin/moderation/history`: every paid ad and club order. `from`/`to` filter the creation date. */
export class PromotionHistoryQueryDto extends AdminListQueryDto {
  @IsOptional()
  @IsIn(PROMOTION_TYPES)
  readonly type?: PromotionTypeFilter;

  @IsOptional()
  @IsIn(PROMOTION_STATUSES)
  readonly status?: PromotionStatus;

  @IsOptional()
  @IsIn(PROMOTION_SORTS)
  readonly sort?: PromotionSort;
}

export class AdminRejectDto {
  /** Shown to the buyer. */
  @IsString()
  @MinLength(3, { message: 'Tell the buyer why (at least 3 characters)' })
  @MaxLength(300)
  readonly reason: string;

  /** Default true: paid items move to refund-due. False: rejected without refund (fraud, repeat abuse). */
  @IsOptional()
  @IsBoolean()
  readonly refund?: boolean;
}

export class AdminMarkRefundedDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  readonly note?: string;
}
