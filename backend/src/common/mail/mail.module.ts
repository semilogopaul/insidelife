import { Module } from '@nestjs/common';
import { MailService } from './mail.service.js';

/** One SMTP transport per process, for every domain that emails players (today: sign-up codes). */
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
