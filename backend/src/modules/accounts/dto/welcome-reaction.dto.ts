import { IsIn } from 'class-validator';
import { WELCOME_REACTIONS, type WelcomeReaction, type WelcomeReactionRequest } from '@insidelife/shared';

export class WelcomeReactionDto implements WelcomeReactionRequest {
  @IsIn(WELCOME_REACTIONS)
  readonly reaction: WelcomeReaction;
}
