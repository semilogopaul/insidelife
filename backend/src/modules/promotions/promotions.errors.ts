import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception.js';

/** A booking rule blocked the request (dates, capacity, link, file). Messages are written for players. */
export class PromotionRuleException extends DomainException {
  constructor(errorCode: string, message: string, details?: readonly string[]) {
    super(errorCode, message, HttpStatus.UNPROCESSABLE_ENTITY, details);
  }
}

/**
 * The price changed between what the buyer saw and checkout (ops re-priced the slot): nothing is charged. `details`
 * carries the new quote as `weekPriceKobo=…` and `totalKobo=…`; the app reloads prices and asks again.
 */
export class PriceChangedException extends PromotionRuleException {
  constructor(message: string, weekPriceKobo: number, totalKobo: number) {
    super('PRICE_CHANGED', message, [`weekPriceKobo=${weekPriceKobo}`, `totalKobo=${totalKobo}`]);
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
