import type { AdRateDto } from '@insidelife/shared';
import { ForbiddenActionException } from '../../../common/exceptions/domain.exception.js';
import type { AuditService } from '../../audit/audit.service.js';
import type { AuditActor } from '../../audit/audit.types.js';
import type { AdRatesService } from '../../promotions/ad-rates.service.js';
import { AdminAdRatesController } from './admin-ad-rates.controller.js';

const rate = (currentKobo: number): AdRateDto => ({
  key: 'phone-app',
  label: 'Sponsored phone app',
  unit: 'week',
  byDistrict: false,
  defaultKobo: 10_000_000,
  currentKobo,
  updatedAt: null,
  updatedBy: null,
});
const actor = (role: AuditActor['role']): AuditActor => ({ userId: 'u-1', email: 'boss@example.com', role, ip: null, userAgent: null, traceId: null });

function setup(current = 10_000_000) {
  const rates = {
    list: vi.fn(async () => [rate(current)]),
    setRate: vi.fn(async (_key: string, priceKobo: number) => rate(priceKobo)),
    resetRate: vi.fn(async () => rate(10_000_000)),
  };
  const audit = { recordNow: vi.fn(async () => 'audit-1') };
  const controller = new AdminAdRatesController(rates as unknown as AdRatesService, audit as unknown as AuditService);
  return { controller, rates, audit };
}

describe('admin ad prices', () => {
  it('lists the rate card', async () => {
    const { controller } = setup();
    expect((await controller.list()).rates.map((r) => r.key)).toEqual(['phone-app']);
  });

  it('only an owner changes a price, and every change is audited with before, after and reason', async () => {
    const { controller, rates, audit } = setup();
    await expect(controller.update('phone-app', { priceKobo: 15_000_000, reason: 'Demand is high' }, actor('admin'))).rejects.toBeInstanceOf(ForbiddenActionException);
    expect(rates.setRate).not.toHaveBeenCalled();

    const updated = await controller.update('phone-app', { priceKobo: 15_000_000, reason: '  Demand is high ' }, actor('owner'));
    expect(updated.currentKobo).toBe(15_000_000);
    expect(rates.setRate).toHaveBeenCalledWith('phone-app', 15_000_000, 'u-1', 'Demand is high');
    expect(audit.recordNow).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'owner' }),
      expect.objectContaining({ action: 'ad-rate.update', target: expect.objectContaining({ type: 'ad-rate', id: 'phone-app' }), before: { priceKobo: 10_000_000 }, reason: 'Demand is high' }),
    );
  });

  it('setting the default price back removes the override', async () => {
    const { controller, rates } = setup(15_000_000);
    await controller.update('phone-app', { priceKobo: 10_000_000, reason: 'Back to normal' }, actor('owner'));
    expect(rates.resetRate).toHaveBeenCalledWith('phone-app');
    expect(rates.setRate).not.toHaveBeenCalled();
  });
});
