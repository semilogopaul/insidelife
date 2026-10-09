import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AppConfig } from '../../../config/configuration.js';
import { SecretBox, deriveKey } from './secret-box.js';

/** JwtService for admin tokens only: its own key (derived) and audience, so player tokens never pass as admin ones. */
export const ADMIN_JWT = Symbol('ADMIN_JWT');
export const ADMIN_AUDIENCE = 'insidelife-admin';

export interface AdminKeys {
  /** Encrypts authenticator secrets. */
  readonly mfaBox: SecretBox;
  /** Keys the recovery-code hashes. */
  readonly recoveryKey: Buffer;
}
export const ADMIN_KEYS = Symbol('ADMIN_KEYS');

export const adminKeyProviders: Provider[] = [
  {
    provide: ADMIN_JWT,
    inject: [ConfigService],
    useFactory: (config: ConfigService<AppConfig, true>): JwtService =>
      new JwtService({
        secret: deriveKey(config.get('auth', { infer: true }).accessSecret, 'admin-access-token').toString('base64url'),
        signOptions: { algorithm: 'HS256', issuer: 'insidelife', audience: ADMIN_AUDIENCE },
        verifyOptions: { algorithms: ['HS256'], issuer: 'insidelife', audience: ADMIN_AUDIENCE },
      }),
  },
  {
    provide: ADMIN_KEYS,
    inject: [ConfigService],
    useFactory: (config: ConfigService<AppConfig, true>): AdminKeys => {
      // ADMIN_MFA_KEY is required on the live site; locally it falls back to the JWT secret (domain-separated).
      const root = config.get('admin', { infer: true }).mfaKey || config.get('auth', { infer: true }).accessSecret;
      return { mfaBox: new SecretBox(deriveKey(root, 'mfa-secret')), recoveryKey: deriveKey(root, 'recovery-codes') };
    },
  },
];
