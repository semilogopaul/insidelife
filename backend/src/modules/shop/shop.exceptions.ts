import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception.js';

/** The requested outfit breaks a wardrobe rule; `details` lists every problem for the dressing-room UI. */
export class InvalidOutfitException extends DomainException {
  constructor(details: readonly string[]) {
    super('INVALID_OUTFIT', details[0] ?? 'That outfit doesn’t work', HttpStatus.UNPROCESSABLE_ENTITY, details);
  }
}
