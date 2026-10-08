import { SetMetadata } from '@nestjs/common';
import type { AuthUser } from '../interfaces/auth-user.interface.js';

export const ROLES = 'roles';

/** Restrict a route to these roles (checked by RolesGuard after authentication). */
export const Roles = (...roles: ReadonlyArray<AuthUser['role']>): MethodDecorator & ClassDecorator => SetMetadata(ROLES, roles);
