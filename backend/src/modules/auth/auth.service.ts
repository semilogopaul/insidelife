import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { IsNull, type Repository } from 'typeorm';
import type { AuthSessionDto, AuthUserDto } from '@insidelife/shared';
import type { AppConfig } from '../../config/configuration.js';
import {
  AuthenticationRequiredException,
  ConflictException,
  InvalidCredentialsException,
} from '../../common/exceptions/domain.exception.js';
import { UsersService } from '../users/users.service.js';
import type { UserEntity } from '../users/entities/user.entity.js';
import { CharacterDirectory } from '../characters/character-directory.service.js';
import { RefreshTokenEntity } from './entities/refresh-token.entity.js';
import type { AccessTokenPayload } from '../../common/interfaces/auth-user.interface.js';

export interface IssuedSession {
  readonly session: AuthSessionDto;
  readonly refreshToken: string;
  readonly refreshExpiresAt: Date;
}

/** Argon2id with OWASP-recommended parameters. */
const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

/** A real hash of a random password, used to keep login timing constant when the email doesn't exist. */
const DUMMY_HASH_PROMISE = argon2.hash(randomBytes(16).toString('hex'), ARGON2_OPTIONS);

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly characters: CharacterDirectory,
    @InjectRepository(RefreshTokenEntity) private readonly refreshTokens: Repository<RefreshTokenEntity>,
  ) {}

  async register(email: string, password: string, userAgent: string | undefined): Promise<IssuedSession> {
    if (await this.users.findByEmail(email)) {
      throw new ConflictException('EMAIL_TAKEN', 'An account with that email already exists — sign in instead');
    }
    const user = await this.users.create(email, await argon2.hash(password, ARGON2_OPTIONS));
    return this.issueSession(user, randomUUID(), userAgent);
  }

  async login(email: string, password: string, userAgent: string | undefined): Promise<IssuedSession> {
    const user = await this.users.findByEmail(email);
    const hash = user?.passwordHash ?? (await DUMMY_HASH_PROMISE);
    const valid = await argon2.verify(hash, password).catch(() => false);
    if (!user || !valid) throw new InvalidCredentialsException();
    await this.users.touchLogin(user.id);
    return this.issueSession(user, randomUUID(), userAgent);
  }

  /** Rotate a refresh token. Reusing an already-rotated token revokes the whole family. */
  async refresh(rawToken: string | undefined, userAgent: string | undefined): Promise<IssuedSession> {
    if (!rawToken) throw new AuthenticationRequiredException();
    const stored = await this.refreshTokens.findOne({ where: { tokenHash: sha256(rawToken) } });
    if (!stored) throw new AuthenticationRequiredException();

    if (stored.revokedAt) {
      await this.revokeFamily(stored.familyId);
      throw new AuthenticationRequiredException('Your session ended. Please sign in again');
    }
    if (stored.expiresAt.getTime() <= Date.now()) throw new AuthenticationRequiredException('Your session expired. Please sign in again');

    const user = await this.users.findById(stored.userId);
    if (!user) throw new AuthenticationRequiredException();

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
    const user = await this.users.findById(userId);
    if (!user) throw new AuthenticationRequiredException();
    return this.toUserDto(user);
  }

  private async issueSession(user: UserEntity, familyId: string, userAgent: string | undefined): Promise<IssuedSession> {
    const auth = this.config.get('auth', { infer: true });
    const role = this.config.get('adminEmails', { infer: true }).includes(user.email) ? 'admin' : user.role;
    const payload: AccessTokenPayload = { sub: user.id, email: user.email, role };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: auth.accessTtlSeconds });

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

    return {
      session: {
        accessToken,
        accessTokenExpiresAt: Date.now() + auth.accessTtlSeconds * 1000,
        user: await this.toUserDto(user),
      },
      refreshToken,
      refreshExpiresAt,
    };
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.refreshTokens.update({ familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  private async toUserDto(user: UserEntity): Promise<AuthUserDto> {
    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerifiedAt !== null,
      hasCharacter: await this.characters.hasLivingCharacter(user.id),
    };
  }
}
