import { Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { PaymentVerificationDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CheckoutService } from './checkout.service.js';
import { toPaymentDto } from './payment.mapper.js';

/**
 * The fake checkout's buttons (development only). Every route 404s unless the server runs the sandbox gateway; only
 * the payment's owner can decide its outcome. "Succeed" behaves like a Flutterwave charge + webhook: it delivers.
 */
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Controller({ path: 'payments/sandbox', version: '1' })
export class PaymentsSandboxController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post(':reference/succeed')
  @HttpCode(HttpStatus.OK)
  async succeed(@CurrentUser() user: AuthUser, @Param('reference', ParseUUIDPipe) reference: string): Promise<PaymentVerificationDto> {
    const { payment, fulfilledNow } = await this.checkout.simulate(user.userId, reference, 'success');
    return { payment: toPaymentDto(payment), fulfilledNow };
  }

  @Post(':reference/fail')
  @HttpCode(HttpStatus.OK)
  async fail(@CurrentUser() user: AuthUser, @Param('reference', ParseUUIDPipe) reference: string): Promise<PaymentVerificationDto> {
    const { payment, fulfilledNow } = await this.checkout.simulate(user.userId, reference, 'failed');
    return { payment: toPaymentDto(payment), fulfilledNow };
  }
}
