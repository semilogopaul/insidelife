import { IsIn } from 'class-validator';
import { PLAY_STATES, type PlayState, type PlayStateRequestDto } from '@insidelife/shared';

export class UpdatePlayStateDto implements PlayStateRequestDto {
  @IsIn(PLAY_STATES)
  readonly state!: PlayState;
}
