import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { MarkRefundedRequest, RejectPromotionRequest } from '@insidelife/shared';

export class RejectPromotionDto implements RejectPromotionRequest {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  readonly reason: string;

  @IsOptional()
  @IsBoolean()
  readonly refund?: boolean;
}

export class MarkRefundedDto implements MarkRefundedRequest {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  readonly note?: string;
}
