import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  PaymentDto,
  PaymentVerificationDto,
  TopupCatalogDto,
  TopupStartedDto,
  TopupVerificationDto,
} from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CheckoutService } from './checkout.service.js';
import { CreateTopupDto } from './dto/create-topup.dto.js';
import { toPaymentDto } from './payment.mapper.js';
import { TopupsService } from './topups.service.js';

const HISTORY_LIMIT = 50;

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

  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post('topups')
  startTopup(@CurrentUser() user: AuthUser, @Body() body: CreateTopupDto): Promise<TopupStartedDto> {
    return this.topups.start(user.userId, body.packageId);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('topups/:reference/verification')
  verifyTopup(@CurrentUser() user: AuthUser, @Param('reference', ParseUUIDPipe) reference: string): Promise<TopupVerificationDto> {
    return this.topups.verify(user.userId, reference);
  }

  /** Any purpose (top-up, billboard, club play): confirm with the gateway and deliver if paid. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post(':reference/verification')
  async verify(@CurrentUser() user: AuthUser, @Param('reference', ParseUUIDPipe) reference: string): Promise<PaymentVerificationDto> {
    const { payment, fulfilledNow } = await this.checkout.verify(user.userId, reference);
    return { payment: toPaymentDto(payment), fulfilledNow };
  }
}
