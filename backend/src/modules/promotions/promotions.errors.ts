import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception.js';

/** A booking rule blocked the request (dates, capacity, link, file). Messages are written for players. */
export class PromotionRuleException extends DomainException {
  constructor(errorCode: string, message: string) {
    super(errorCode, message, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

/** The uploaded file is not acceptable (type, size, dimensions, duration). */
export class InvalidMediaException extends DomainException {
  constructor(message: string) {
    super('INVALID_MEDIA', message, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

/** The item is not in a state that allows this (e.g. cancelling a paid campaign). */
export class PromotionStateException extends DomainException {
  constructor(message: string) {
    super('PROMOTION_STATE_CONFLICT', message, HttpStatus.CONFLICT);
  }
}
