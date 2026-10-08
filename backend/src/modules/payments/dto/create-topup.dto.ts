import { IsIn } from 'class-validator';
import { TOPUP_PACKAGE_IDS, type CreateTopupRequest, type TopupPackageId } from '@insidelife/shared';

export class CreateTopupDto implements CreateTopupRequest {
  @IsIn(TOPUP_PACKAGE_IDS)
  readonly packageId: TopupPackageId;
}
