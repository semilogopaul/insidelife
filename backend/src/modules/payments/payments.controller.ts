import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type {
  PaymentDto,
  PaymentVerificationDto,
  TopupCatalogDto,
  TopupStartedDto,
  TopupVerificationDto,
} from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { requestOrigin } from '../../common/http/request-origin.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CheckoutService } from './checkout.service.js';
import { CreateTopupDto } from './dto/create-topup.dto.js';
import { VerifyPaymentDto } from './dto/verify-payment.dto.js';
import { toPaymentDto } from './payment.mapper.js';
import { TopupsService } from './topups.service.js';

const HISTORY_LIMIT = 50;
/**
 * Verification requests per client a minute. Generous on purpose: what reaches Flutterwave is limited per payment and
 * per account in `CheckoutService.verify`, and players behind one carrier IP share this budget.
 */
const VERIFY_THROTTLE = { default: { limit: 40, ttl: 60_000 } };

/** My real-money payments: history, top-up packs, starting and verifying checkouts. */
@Controller({ path: 'payments', version: '1' })
export class PaymentsController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly topups: TopupsService,
  ) {}

  @Get()
  async history(@CurrentUser() user: AuthUser): Promise<PaymentDto[]> {
    return (await this.checkout.findForUser(user.userId, HISTORY_LIMIT)).map(toPaymentDto);
  }

  @Get('packages')
  packages(@CurrentUser() user: AuthUser): Promise<TopupCatalogDto> {
    return this.topups.catalog(user.userId);
  }

  /** Flutterwave returns the player to the callback page on the origin they started from, when it is one of ours. */
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post('topups')
  startTopup(@CurrentUser() user: AuthUser, @Body() body: CreateTopupDto, @Req() request: Request): Promise<TopupStartedDto> {
    return this.topups.start(user.userId, body, requestOrigin(request));
  }

  @Throttle(VERIFY_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('topups/:reference/verification')
  verifyTopup(
    @CurrentUser() user: AuthUser,
    @Param('reference', ParseUUIDPipe) reference: string,
    @Body() body: VerifyPaymentDto,
  ): Promise<TopupVerificationDto> {
    return this.topups.verify(user.userId, reference, body.transactionId);
  }

  /**
   * Any purpose (top-up, billboard, club play): confirm with Flutterwave and deliver if paid. Backs the callback page,
   * "I've paid: check now" and the game's recovery check; safe to call often (see `CheckoutService.verify`).
   */
  @Throttle(VERIFY_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post(':reference/verification')
  async verify(
    @CurrentUser() user: AuthUser,
    @Param('reference', ParseUUIDPipe) reference: string,
    @Body() body: VerifyPaymentDto,
  ): Promise<PaymentVerificationDto> {
    const { payment, fulfilledNow } = await this.checkout.verify(user.userId, reference, body.transactionId);
    return { payment: toPaymentDto(payment), fulfilledNow };
  }
}
