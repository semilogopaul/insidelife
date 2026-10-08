import { IsString, MaxLength } from 'class-validator';
import type { ResolveLifeEventRequest } from '@insidelife/shared';

export class ResolveLifeEventDto implements ResolveLifeEventRequest {
  @IsString()
  @MaxLength(32)
  readonly choiceId: string;
}
