import { IsIn } from 'class-validator';
import { HMO_PLAN_IDS, type HmoPlanId, type JoinHmoRequest } from '@insidelife/shared';

export class JoinHmoDto implements JoinHmoRequest {
  @IsIn([...HMO_PLAN_IDS])
  readonly planId: HmoPlanId;
}
