import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/configuration.js';
import { AllowUnverifiedEmail } from '../../common/decorators/allow-unverified-email.decorator.js';
import { DomainException } from '../../common/exceptions/domain.exception.js';
import type { AccessTokenPayload } from '../../common/interfaces/auth-user.interface.js';
import type { UsersService } from '../users/users.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

class Routes {
  play(): void {}

  @AllowUnverifiedEmail()
  verifyEmail(): void {}
}

/** Tokens in these tests are the JSON payload itself. */
function guardFor(verifiedInDb: boolean, requireEmailVerification = true) {
  const jwt = {
    verifyAsync: async (token: string) => JSON.parse(token) as AccessTokenPayload,
  } as unknown as JwtService;
  const users = { findById: vi.fn(async () => ({ emailVerifiedAt: verifiedInDb ? new Date() : null })) };
  const config = { get: () => ({ requireEmailVerification }) } as unknown as ConfigService<AppConfig, true>;
  return { guard: new JwtAuthGuard(new Reflector(), jwt, users as unknown as UsersService, config), users };
}

function context(handler: keyof Routes, payload: AccessTokenPayload): ExecutionContext {
  const request = { headers: { authorization: `Bearer ${JSON.stringify(payload)}` } };
  return {
    getType: () => 'http',
    getHandler: () => Routes.prototype[handler],
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const codeOf = async (promise: Promise<unknown>): Promise<string> =>
  promise.then(
    () => 'ok',
    (error: unknown) => (error instanceof DomainException ? error.errorCode : 'unexpected'),
  );

const unverified: AccessTokenPayload = { sub: 'u1', email: 'a@b.c', role: 'player', ev: false };

describe('JwtAuthGuard with REQUIRE_EMAIL_VERIFICATION on', () => {
  it('refuses unverified accounts everywhere except the routes that let them verify', async () => {
    const { guard } = guardFor(false);
    expect(await codeOf(guard.canActivate(context('play', unverified)))).toBe('EMAIL_UNVERIFIED');
    expect(await codeOf(guard.canActivate(context('verifyEmail', unverified)))).toBe('ok');
    expect(await codeOf(guard.verifyPlayer(JSON.stringify(unverified)))).toBe('EMAIL_UNVERIFIED');
  });

  it('trusts the verified claim without a database read', async () => {
    const { guard, users } = guardFor(false);
    expect(await codeOf(guard.canActivate(context('play', { ...unverified, ev: true })))).toBe('ok');
    expect(users.findById).not.toHaveBeenCalled();
  });

  it('lets an older or pre-confirmation token through once the database says verified', async () => {
    const { guard } = guardFor(true);
    const { ev: _ev, ...legacy } = unverified;
    expect(await codeOf(guard.canActivate(context('play', legacy)))).toBe('ok');
    expect(await codeOf(guard.verifyPlayer(JSON.stringify(unverified)))).toBe('ok');
  });
});

describe('JwtAuthGuard with email verification optional (the default)', () => {
  it('lets unverified accounts play, without a database read', async () => {
    const { guard, users } = guardFor(false, false);
    expect(await codeOf(guard.canActivate(context('play', unverified)))).toBe('ok');
    expect(await codeOf(guard.verifyPlayer(JSON.stringify(unverified)))).toBe('ok');
    expect(users.findById).not.toHaveBeenCalled();
  });
});
