import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import type { AdRateDto } from '@insidelife/shared';
import { ForbiddenActionException } from '../../../common/exceptions/domain.exception.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuditActor } from '../../audit/audit.types.js';
import { AdRatesService } from '../../promotions/ad-rates.service.js';
import { Actor, AdminRoute } from '../common/admin.decorators.js';
import { UpdateAdRateDto } from './dto/ad-rates.dto.js';

/**
 * Ad prices (per 7 days, or per song): every admin can see them; only an owner changes them. A change applies to new
 * quotes and orders at once (paid and pending orders keep the price they were quoted) and is audited. Setting a price
 * back to its default removes the override.
 */
@AdminRoute()
@Controller({ path: 'admin/ad-rates', version: '1' })
export class AdminAdRatesController {
  constructor(
    private readonly rates: AdRatesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(): Promise<{ readonly rates: AdRateDto[] }> {
    return { rates: await this.rates.list() };
  }

  @Put(':key')
  async update(@Param('key') key: string, @Body() body: UpdateAdRateDto, @Actor() actor: AuditActor): Promise<AdRateDto> {
    if (actor.role !== 'owner') throw new ForbiddenActionException('Only an owner can change ad prices');
    const before = (await this.rates.list()).find((rate) => rate.key === key);
    const reason = body.reason.trim();
    const after =
      before && body.priceKobo === before.defaultKobo
        ? await this.rates.resetRate(key)
        : await this.rates.setRate(key, body.priceKobo, actor.userId, reason);
    await this.audit.recordNow(actor, {
      action: 'ad-rate.update',
      target: { type: 'ad-rate', id: after.key, label: after.label },
      before: before ? { priceKobo: before.currentKobo } : null,
      after: { priceKobo: after.currentKobo, isDefault: after.currentKobo === after.defaultKobo },
      reason,
    });
    return after;
  }
}
