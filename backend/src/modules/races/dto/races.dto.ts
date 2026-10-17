import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { RACE_MAX_RACERS, type CreateRaceRequest } from '@insidelife/shared';
import { IsIdempotencyKey } from '../../../common/decorators/idempotency-key.decorator.js';

export class CreateRaceDto implements CreateRaceRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(RACE_MAX_RACERS - 1)
  @IsUUID('all', { each: true })
  readonly friendIds: string[];

  @IsIdempotencyKey()
  readonly idempotencyKey?: string;
}
