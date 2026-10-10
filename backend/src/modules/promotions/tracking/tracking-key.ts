import { createHmac } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../config/configuration.js';

/** A purpose-bound key derived from the server secret: viewer and listener hashes can't be reversed or forged. */
export function promotionsHashKey(config: ConfigService<AppConfig, true>): string {
  return createHmac('sha256', config.get('auth', { infer: true }).accessSecret).update('promotions:viewer-hash:v1').digest('base64url');
}
