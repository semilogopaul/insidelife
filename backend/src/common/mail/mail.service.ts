import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { AppConfig } from '../../config/configuration.js';
import { ExternalServiceException } from '../exceptions/domain.exception.js';

export interface OutgoingMail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/** Fail fast: a player is waiting on the other side of the request. */
const CONNECTION_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 20_000;

/**
 * Outgoing email over SMTP (any provider: Brevo's free tier, the mailbox host of hello@insidelife.online, Mailpit in
 * the local docker stack). Plain transactional mail only: no tracking pixels, no click tracking, no remote images.
 * `configured` is false when no SMTP settings exist, which the env validation allows only outside production.
 */
@Injectable()
export class MailService implements OnApplicationShutdown {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const mail = config.get('mail', { infer: true });
    this.from = mail.from;
    this.transport = mail.smtpUrl || mail.host ? createTransport(transportOptions(mail)) : null;
  }

  get configured(): boolean {
    return this.transport !== null;
  }

  async send(message: OutgoingMail): Promise<void> {
    if (!this.transport) throw new ExternalServiceException('Email');
    try {
      await this.transport.sendMail({ from: this.from, ...message });
    } catch (error) {
      // The provider's reply can echo the recipient; log only the failure kind.
      this.logger.error(`Email not sent: ${error instanceof Error ? error.name : 'unknown error'}`);
      throw new ExternalServiceException('Email');
    }
  }

  onApplicationShutdown(): void {
    this.transport?.close();
  }
}

function transportOptions(mail: AppConfig['mail']) {
  const shared = {
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: CONNECTION_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
    // Messages are built from our own templates: never let a message read local files or fetch URLs.
    disableFileAccess: true,
    disableUrlAccess: true,
  };
  if (mail.smtpUrl) return { ...shared, url: mail.smtpUrl };
  return {
    ...shared,
    host: mail.host,
    port: mail.port,
    secure: mail.secure,
    auth: mail.user ? { user: mail.user, pass: mail.pass } : undefined,
  };
}
