import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { IsNull, MoreThan, type Repository } from 'typeorm';
import {
  BIRTH_DATE_MESSAGES,
  birthDateProblem,
  utcCalendarDate,
  type AuthSessionDto,
  type AuthUserDto,
  type EmailVerificationDto,
} from '@insidelife/shared';
import type { AppConfig } from '../../config/configuration.js';
import {
  AccountDeletedException,
  AccountSuspendedException,
  AuthenticationRequiredException,
  ConflictException,
  InvalidCredentialsException,
  ValidationFailedException,
} from '../../common/exceptions/domain.exception.js';
import { UsersService } from '../users/users.service.js';
import type { UserEntity } from '../users/entities/user.entity.js';
import { CharacterDirectory } from '../characters/character-directory.service.js';
import { UnderAgeException } from './auth.exceptions.js';
import { EmailVerificationService } from './email-verification.service.js';
import { RefreshTokenEntity } from './entities/refresh-token.entity.js';
import type { AccessTokenPayload } from '../../common/interfaces/auth-user.interface.js';

export interface IssuedSession {
  readonly session: AuthSessionDto;
  readonly refreshToken: string;
  readonly refreshExpiresAt: Date;
}

export interface RegisteredSession extends IssuedSession {
  readonly emailVerification: EmailVerificationDto;
}

/** Argon2id with OWASP-recommended parameters. */
const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

/** A real hash of a random password, used to keep login timing constant when the email doesn't exist. */
const DUMMY_HASH_PROMISE = argon2.hash(randomBytes(16).toString('hex'), ARGON2_OPTIONS);

/**
 * A refresh token that was rotated moments ago still works for this long, inside the same family. Two tabs (or the
 * installed app and a tab) refreshing at once, or a refresh whose response was lost while the API restarted, present
 * the same token twice; that's a race, not a theft. After the window, reuse revokes the whole family.
 */
export const REFRESH_REUSE_GRACE_MS = 60_000;

/** Date-of-birth checks use the latest calendar date anywhere on Earth (UTC+14), so nobody is refused a day early. */
const LATEST_TIMEZONE_MS = 14 * 3_600_000;

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly characters: CharacterDirectory,
    private readonly verification: EmailVerificationService,
    @InjectRepository(RefreshTokenEntity) private readonly refreshTokens: Repository<RefreshTokenEntity>,
  ) {}

  /**
   * New accounts start with an unconfirmed email. With REQUIRE_EMAIL_VERIFICATION on, the first code is emailed now
   * and the account can't play until it's entered; otherwise nothing is sent and the player can verify later from
   * Me → Settings.
   */
  async register(email: string, password: string, birthDate: string, userAgent: string | undefined): Promise<RegisteredSession> {
    assertOldEnough(birthDate, Date.now());
    const existing = await this.users.findByEmail(email);
    if (existing?.deletedAt) {
      // The address stays reserved while the deleted account can still be restored.
      throw new ConflictException('EMAIL_TAKEN', 'That email belongs to a recently deleted account. Email hello@insidelife.online to restore it, or use another email');
    }
    if (existing) {
      throw new ConflictException('EMAIL_TAKEN', 'An account with that email already exists — sign in instead');
    }
    const user = await this.users.create(email, await argon2.hash(password, ARGON2_OPTIONS), birthDate);
    const issued = await this.issueSession(user, randomUUID(), userAgent);
    const emailVerification = this.emailRequired() ? await this.sendFirstCode(user) : await this.verification.status(user);
    return { ...issued, emailVerification };
  }

  async login(email: string, password: string, userAgent: string | undefined): Promise<IssuedSession> {
    const user = await this.checkCredentials(email, password);
    if (!user) throw new InvalidCredentialsException();
    // Only after the password checks out, so the account's status never leaks to someone guessing emails.
    assertMaySignIn(user);
    await this.users.touchLogin(user.id);
    return this.issueSession(user, randomUUID(), userAgent);
  }

  /**
   * The account when the email and password match, else null. Takes the same time whether or not the email exists.
   * Doesn't look at the account's status (callers decide). Also used by the admin portal's sign-in.
   */
  async checkCredentials(email: string, password: string): Promise<UserEntity | null> {
    const user = await this.users.findByEmail(email);
    const hash = user?.passwordHash ?? (await DUMMY_HASH_PROMISE);
    const valid = await argon2.verify(hash, password).catch(() => false);
    return user && valid ? user : null;
  }

  /** Check a signed-in player's password again (before deleting the account). */
  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const user = await this.users.findById(userId);
    if (!user) return false;
    return argon2.verify(user.passwordHash, password).catch(() => false);
  }

  /**
   * Rotate a refresh token (the session rolls: every refresh pushes expiry out by the full refresh TTL). Reusing an
   * already-rotated token revokes the whole family, except within REFRESH_REUSE_GRACE_MS of its rotation.
   */
  async refresh(rawToken: string | undefined, userAgent: string | undefined): Promise<IssuedSession> {
    if (!rawToken) throw new AuthenticationRequiredException();
    const stored = await this.refreshTokens.findOne({ where: { tokenHash: sha256(rawToken) } });
    if (!stored) throw new AuthenticationRequiredException();

    if (stored.revokedAt) {
      if (await this.isRecentRotation(stored)) return this.issueSession(await this.requireUser(stored.userId), stored.familyId, userAgent);
      await this.revokeFamily(stored.familyId);
      throw new AuthenticationRequiredException('Your session ended. Please sign in again');
    }
    if (stored.expiresAt.getTime() <= Date.now()) throw new AuthenticationRequiredException('Your session expired. Please sign in again');

    const user = await this.requireUser(stored.userId);
    if (user.suspendedAt || user.deletedAt) {
      await this.revokeFamily(stored.familyId);
      throw new AuthenticationRequiredException(user.deletedAt ? 'This account was deleted' : 'This account is suspended');
    }
    const issued = await this.issueSession(user, stored.familyId, userAgent);
    const replacement = await this.refreshTokens.findOne({ where: { tokenHash: sha256(issued.refreshToken) } });
    await this.refreshTokens.update({ id: stored.id }, { revokedAt: new Date(), replacedById: replacement?.id ?? null });
    return issued;
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const stored = await this.refreshTokens.findOne({ where: { tokenHash: sha256(rawToken) } });
    if (stored) await this.revokeFamily(stored.familyId);
  }

  async describe(userId: string): Promise<AuthUserDto> {
    return this.toUserDto(await this.requireUser(userId));
  }

  async emailVerificationStatus(userId: string): Promise<EmailVerificationDto> {
    return this.verification.status(await this.requireUser(userId));
  }

  async sendEmailCode(userId: string): Promise<EmailVerificationDto> {
    return this.verification.send(await this.requireUser(userId));
  }

  /** Check the code; on success the email is confirmed and a new access token (allowed to play) is returned. */
  async confirmEmail(userId: string, code: string): Promise<AuthSessionDto> {
    const user = await this.requireUser(userId);
    if (!user.emailVerifiedAt) {
      await this.verification.confirm(user, code);
      await this.users.markEmailVerified(user.id);
      await this.verification.clear(user.id);
    }
    return this.accessSession(await this.requireUser(userId));
  }

  /** The account exists either way: if the email can't go out now, the check-your-email screen offers a resend. */
  private async sendFirstCode(user: UserEntity): Promise<EmailVerificationDto> {
    try {
      return await this.verification.send(user);
    } catch (error) {
      this.logger.warn(`Sign-up code not sent: ${error instanceof Error ? error.message : 'unknown error'}`);
      return { email: user.email, verified: false, available: true, codeExpiresAt: null, resendAvailableAt: Date.now() };
    }
  }

  /** Rotated (not signed out) moments ago, and the family still has a live token: a refresh race, not a theft. */
  private async isRecentRotation(stored: RefreshTokenEntity): Promise<boolean> {
    if (!stored.revokedAt || !stored.replacedById) return false;
    if (Date.now() - stored.revokedAt.getTime() > REFRESH_REUSE_GRACE_MS) return false;
    return this.refreshTokens.exists({
      where: { familyId: stored.familyId, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
    });
  }

  private emailRequired(): boolean {
    return this.config.get('auth', { infer: true }).requireEmailVerification;
  }

  private async requireUser(userId: string): Promise<UserEntity> {
    const user = await this.users.findById(userId);
    if (!user) throw new AuthenticationRequiredException();
    return user;
  }

  private async accessSession(user: UserEntity): Promise<AuthSessionDto> {
    const auth = this.config.get('auth', { infer: true });
    const role = this.config.get('adminEmails', { infer: true }).includes(user.email) ? 'admin' : user.role;
    const payload: AccessTokenPayload = { sub: user.id, email: user.email, role, ev: user.emailVerifiedAt !== null, ia: Date.now() };
    return {
      accessToken: await this.jwt.signAsync(payload, { expiresIn: auth.accessTtlSeconds }),
      accessTokenExpiresAt: Date.now() + auth.accessTtlSeconds * 1000,
      user: await this.toUserDto(user),
    };
  }

  private async issueSession(user: UserEntity, familyId: string, userAgent: string | undefined): Promise<IssuedSession> {
    const auth = this.config.get('auth', { infer: true });
    const refreshToken = randomBytes(32).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + auth.refreshTtlDays * 86_400_000);
    await this.refreshTokens.save(
      this.refreshTokens.create({
        userId: user.id,
        familyId,
        tokenHash: sha256(refreshToken),
        expiresAt: refreshExpiresAt,
        revokedAt: null,
        replacedById: null,
        userAgent: userAgent?.slice(0, 255) ?? null,
      }),
    );
    return { session: await this.accessSession(user), refreshToken, refreshExpiresAt };
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.refreshTokens.update({ familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  private async toUserDto(user: UserEntity): Promise<AuthUserDto> {
    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerifiedAt !== null,
      mustVerifyEmail: this.emailRequired() && user.emailVerifiedAt === null,
      hasCharacter: await this.characters.hasLivingCharacter(user.id),
    };
  }
}

/** Suspended and deleted accounts can't start a session (checked after the password). */
export function assertMaySignIn(user: Pick<UserEntity, 'suspendedAt' | 'deletedAt' | 'purgeAfter'>): void {
  if (user.deletedAt) throw new AccountDeletedException(user.purgeAfter);
  if (user.suspendedAt) throw new AccountSuspendedException();
}

/** Sign-up age rules (shared with the client): a real date, not in the future, 13 or older. */
export function assertOldEnough(birthDate: string, nowMs: number): void {
  const problem = birthDateProblem(birthDate, utcCalendarDate(nowMs + LATEST_TIMEZONE_MS));
  if (problem === 'too-young') throw new UnderAgeException();
  if (problem) throw new ValidationFailedException([BIRTH_DATE_MESSAGES[problem]]);
}
