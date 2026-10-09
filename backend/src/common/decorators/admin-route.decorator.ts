import { SetMetadata } from '@nestjs/common';

export const ADMIN_ROUTE = 'adminRoute';

/**
 * Marks a route as part of the admin API. The global player JWT guard steps aside for it: admin routes are guarded by
 * the admin module's own guard (admin-only tokens issued after password + authenticator code). Use the admin
 * module's `@AdminRoute()`, which sets this and attaches that guard.
 */
export const AdminRouteMarker = (): MethodDecorator & ClassDecorator => SetMetadata(ADMIN_ROUTE, true);
