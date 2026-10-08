import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../interfaces/auth-user.interface.js';
import { AuthenticationRequiredException } from '../exceptions/domain.exception.js';

/** The authenticated user for the current request (set by the global JWT guard). */
export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext): AuthUser => {
  const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
  if (!request.user) throw new AuthenticationRequiredException();
  return request.user;
});
