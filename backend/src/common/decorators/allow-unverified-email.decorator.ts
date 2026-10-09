import { SetMetadata } from '@nestjs/common';

export const ALLOW_UNVERIFIED_EMAIL = 'allowUnverifiedEmail';

/**
 * Let a signed-in player whose email isn't confirmed yet reach this route. Everything else (character creation, the
 * game, the realtime socket) refuses them with EMAIL_UNVERIFIED until they enter the code.
 */
export const AllowUnverifiedEmail = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_UNVERIFIED_EMAIL, true);
