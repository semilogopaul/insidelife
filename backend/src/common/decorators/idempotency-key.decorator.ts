import { applyDecorators } from '@nestjs/common';
import { IsOptional, Matches } from 'class-validator';

/** Client idempotency keys: 8-64 letters, numbers, `-` or `_` (a UUID fits). */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** An optional "tap once" key: a retry with the same key gets the first result back instead of acting twice. */
export const IsIdempotencyKey = (): PropertyDecorator =>
  applyDecorators(IsOptional(), Matches(IDEMPOTENCY_KEY_PATTERN, { message: 'idempotencyKey must be 8-64 letters, numbers, - or _' }));
