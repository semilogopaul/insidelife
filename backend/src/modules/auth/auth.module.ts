import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { createSecretKey } from 'node:crypto';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { AppConfig } from '../../config/configuration.js';
import { MailModule } from '../../common/mail/mail.module.js';
import { CharactersModule } from '../characters/characters.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { EmailVerificationService } from './email-verification.service.js';
import { RefreshTokenEntity } from './entities/refresh-token.entity.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { SessionRevocationService } from './session-revocation.service.js';

@Module({
  imports: [
    UsersModule,
    CharactersModule,
    MailModule,
    TypeOrmModule.forFeature([RefreshTokenEntity]),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        // The HMAC key as a KeyObject, made once: given the plain string, jsonwebtoken first tries (and fails) to parse
        // it as a public key on every verify, an exception per request. Same key bytes, so the same tokens.
        const key = createSecretKey(Buffer.from(config.get('auth', { infer: true }).accessSecret));
        return {
          secretOrKeyProvider: () => key,
          signOptions: { algorithm: 'HS256', issuer: 'insidelife' },
          verifyOptions: { algorithms: ['HS256'], issuer: 'insidelife' },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    EmailVerificationService,
    SessionRevocationService,
    JwtAuthGuard,
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
  ],
  exports: [JwtAuthGuard, AuthService, SessionRevocationService],
})
export class AuthModule {}
