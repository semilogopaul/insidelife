import { HttpStatus } from '@nestjs/common';

/**
 * Base class for every expected, user-facing failure. The global exception filter turns it into the standard
 * `{ errorCode, message, timestamp, traceId }` body. Messages are written for players, not engineers.
 */
export class DomainException extends Error {
  constructor(
    readonly errorCode: string,
    message: string,
    readonly status: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly details?: readonly string[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ResourceNotFoundException extends DomainException {
  constructor(resource: string) {
    super('RESOURCE_NOT_FOUND', `${resource} not found`, HttpStatus.NOT_FOUND);
  }
}

export class ValidationFailedException extends DomainException {
  constructor(details: readonly string[]) {
    super('VALIDATION_FAILED', 'Some details need fixing', HttpStatus.BAD_REQUEST, details);
  }
}

export class AuthenticationRequiredException extends DomainException {
  constructor(message = 'Please sign in to continue') {
    super('UNAUTHENTICATED', message, HttpStatus.UNAUTHORIZED);
  }
}

export class InvalidCredentialsException extends DomainException {
  constructor() {
    super('INVALID_CREDENTIALS', 'That email and password don’t match', HttpStatus.UNAUTHORIZED);
  }
}

export class ForbiddenActionException extends DomainException {
  constructor(message = 'You can’t do that') {
    super('FORBIDDEN', message, HttpStatus.FORBIDDEN);
  }
}

export class ConflictException extends DomainException {
  constructor(errorCode: string, message: string) {
    super(errorCode, message, HttpStatus.CONFLICT);
  }
}

/** A game rule blocked the action (wrong place, too young, busy, requirements unmet…). */
export class GameRuleException extends DomainException {
  constructor(errorCode: string, message: string) {
    super(errorCode, message, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

export class InsufficientFundsException extends DomainException {
  constructor(needed?: number) {
    super(
      'INSUFFICIENT_FUNDS',
      needed === undefined ? 'Not enough money for that' : `You need ₦${Math.round(needed).toLocaleString('en-NG')} for that`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class NoCharacterException extends DomainException {
  constructor() {
    super('NO_CHARACTER', 'Create your character first', HttpStatus.CONFLICT);
  }
}

export class RateLimitedException extends DomainException {
  constructor(message = 'Slow down small — try again in a moment') {
    super('RATE_LIMITED', message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

export class ExternalServiceException extends DomainException {
  constructor(service: string) {
    super('EXTERNAL_SERVICE_ERROR', `${service} is not responding right now. Try again shortly`, HttpStatus.BAD_GATEWAY);
  }
}
