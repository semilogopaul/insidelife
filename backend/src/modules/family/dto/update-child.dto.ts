import { IsIn } from 'class-validator';
import { CHILD_SCHOOL_TIERS, type ChildSchoolTier, type UpdateChildRequest } from '@insidelife/shared';

export class UpdateChildDto implements UpdateChildRequest {
  @IsIn(CHILD_SCHOOL_TIERS)
  readonly schoolTier: ChildSchoolTier;
}
