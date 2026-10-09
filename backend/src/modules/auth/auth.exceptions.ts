import { HttpStatus } from '@nestjs/common';
import { BIRTH_DATE_MESSAGES } from '@insidelife/shared';
import { DomainException } from '../../common/exceptions/domain.exception.js';

/** Under the minimum age (13). Friendly, and says when to come back. */
export class UnderAgeException extends DomainException {
  constructor() {
    super('UNDER_MINIMUM_AGE', BIRTH_DATE_MESSAGES['too-young'], HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

export class EmailCodeInvalidException extends DomainException {
  constructor(triesLeft: number) {
    super(
      'EMAIL_CODE_INVALID',
      `That code isn’t right. ${triesLeft} ${triesLeft === 1 ? 'try' : 'tries'} left`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/** No live code: it expired, was replaced by a newer one, or was used up by wrong tries. */
export class EmailCodeExpiredException extends DomainException {
  constructor(message = 'That code has expired. Ask for a new one') {
    super('EMAIL_CODE_EXPIRED', message, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

export class EmailCodeResendLimitedException extends DomainException {
  constructor(retryInMs: number) {
    const seconds = Math.max(1, Math.ceil(retryInMs / 1000));
    const wait = seconds <= 90 ? `${seconds} seconds` : `${Math.ceil(seconds / 60)} minutes`;
    super(
      'EMAIL_CODE_RESEND_LIMITED',
      `You can ask for another code in ${wait}`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/** This deployment has no email settings yet (allowed while verification is optional). */
export class EmailUnavailableException extends DomainException {
  constructor() {
    super(
      'EMAIL_UNAVAILABLE',
      'Email verification isn’t available yet. Try again later',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
