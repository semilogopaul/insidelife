import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain.exception.js';

export class AdminCodeInvalidException extends DomainException {
  constructor() {
    super('ADMIN_CODE_INVALID', 'That code isn’t right. Check your authenticator app and try again', HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

/** Too many wrong passwords or codes for one account: locked for a while (on top of the per-IP rate limit). */
export class AdminLockedException extends DomainException {
  constructor(minutes: number) {
    super('ADMIN_LOCKED', `Too many wrong attempts. Wait ${minutes} minutes and try again`, HttpStatus.TOO_MANY_REQUESTS);
  }
}

/** The step between password and code took too long (or the token is not a challenge). */
export class AdminChallengeExpiredException extends DomainException {
  constructor() {
    super('ADMIN_CHALLENGE_EXPIRED', 'Your sign-in timed out. Enter your password again', HttpStatus.UNAUTHORIZED);
  }
}

export class AdminSessionEndedException extends DomainException {
  constructor(message = 'Your admin session ended. Sign in again') {
    super('UNAUTHENTICATED', message, HttpStatus.UNAUTHORIZED);
  }
}

export class AdminAccessRemovedException extends DomainException {
  constructor() {
    super('ADMIN_ACCESS_REMOVED', 'This account no longer has admin access', HttpStatus.FORBIDDEN);
  }
}
