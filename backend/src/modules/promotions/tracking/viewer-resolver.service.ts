import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';

/**
 * Tracking endpoints are public (beacons, expired sessions must not error), but only signed-in players are counted.
 * This reads the optional Bearer token with the same verification as the global guard; anything invalid is anonymous.
 */
@Injectable()
export class ViewerResolver {
  constructor(private readonly auth: JwtAuthGuard) {}

  async userIdOf(request: Request): Promise<string | null> {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    try {
      return (await this.auth.verify(header.slice(7))).userId;
    } catch {
      return null;
    }
  }
}
