import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { TOPUP_MIN_NGN, TOPUP_PACKAGE_IDS, type CreateTopupRequest, type TopupPackageId } from '@insidelife/shared';

/** Shape checks only: "a pack or an amount, not both" and the configured maximum are checked in TopupsService. */
export class CreateTopupDto implements CreateTopupRequest {
  @IsOptional()
  @IsIn(TOPUP_PACKAGE_IDS)
  readonly packageId?: TopupPackageId;

  /** Whole real naira. */
  @IsOptional()
  @IsInt()
  @Min(TOPUP_MIN_NGN)
  @Max(100_000_000)
  readonly amountNgn?: number;
}
