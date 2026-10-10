import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  BLUEPRINT_IDS,
  CONSTRUCTION_PAYMENT_PLANS,
  DISTRICT_IDS,
  LAND_TITLE_IDS,
  MAX_PLOTS_PER_PURCHASE,
  TENANCY_ACTIONS,
  type BlueprintId,
  type BuyLandRequest,
  type ConstructionPaymentPlan,
  type DistrictId,
  type LandOffersQuery,
  type LandTitleId,
  type StartConstructionRequest,
  type TenancyAction,
  type TenancyRequest,
} from '@insidelife/shared';
import { IsIdempotencyKey } from '../../../common/decorators/idempotency-key.decorator.js';

export class LandQueryDto implements LandOffersQuery {
  @IsOptional()
  @IsIn(DISTRICT_IDS)
  readonly districtId?: DistrictId;
}

export class BuyLandDto implements BuyLandRequest {
  @IsIn(DISTRICT_IDS)
  readonly districtId: DistrictId;

  @IsIn(LAND_TITLE_IDS)
  readonly title: LandTitleId;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PLOTS_PER_PURCHASE)
  readonly plots?: number;
  @IsIdempotencyKey()
  readonly idempotencyKey?: string;
}

export class StartConstructionDto implements StartConstructionRequest {
  @IsIn(BLUEPRINT_IDS)
  readonly blueprintId: BlueprintId;

  @IsOptional()
  @IsIn(CONSTRUCTION_PAYMENT_PLANS)
  readonly payment?: ConstructionPaymentPlan;
}

export class TenancyDto implements TenancyRequest {
  @IsIn(TENANCY_ACTIONS)
  readonly action: TenancyAction;
}
