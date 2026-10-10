import {
  PROMOTION_CONTENT_RULES,
  type BillboardSlotsDto,
  type CampaignCheckoutDto,
  type ClubSongOfferDto,
  type CreativeDto,
  type PromotionReceiptDto,
  type UsdPaymentOptionsDto,
} from '@insidelife/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DetailsStep } from '../components/billboards/DetailsStep';
import { ReceiptCard } from '../components/detail/ReceiptCard';
import type * as PromoteApiModule from '../services/promote.api';
import { promoteApi } from '../services/promote.api';
import { toSlotCatalog } from '../services/slot-views';

vi.mock('../services/promote.api', async (importOriginal) => {
  const actual = await importOriginal<typeof PromoteApiModule>();
  return { ...actual, promoteApi: { ...actual.promoteApi, createCampaign: vi.fn() } };
});

const createCampaign = vi.mocked(promoteApi.createCampaign);
const TODAY = '2026-10-10';
const usd: UsdPaymentOptionsDto = { ngnPerUsd: 1_500, methods: ['card'], minChargeCents: 100 };
const clubSong: ClubSongOfferDto = {
  weekPriceKobo: 3_500_000,
  dayPriceKobo: 500_000,
  priceKobo: 3_500_000,
  days: 7,
  maxWeeks: 4,
  nextStarts: [TODAY, TODAY, TODAY, TODAY],
  startDate: TODAY,
  playsPerDay: 120,
  minPlaysPerDay: 119,
  clubs: 12,
  lanes: 12,
};
const creative: CreativeDto = { creativeKey: 'creative-1', url: 'https://media.test/c.webp', format: 'landscape', width: 1536, height: 512, bytes: 1_000 };

/** One weekly street board at `weekPriceKobo`, with or without dollars. */
function catalogFor(weekPriceKobo: number, options: UsdPaymentOptionsDto | null) {
  const dto: BillboardSlotsDto = {
    today: TODAY,
    maxWeeks: 4,
    maxRunDays: 28,
    slots: [{ id: 'mmia-arrivals', weekPriceKobo, blockDays: 7, blockPriceKobo: weekPriceKobo, maxBlocks: 4, nextStarts: [TODAY, TODAY, TODAY, TODAY], liveCount: 0 }],
    rules: PROMOTION_CONTENT_RULES,
    clubSong,
    usd: options,
  };
  const catalog = toSlotCatalog(dto);
  const slot = catalog.slots[0];
  if (!slot) throw new Error('mmia-arrivals is missing from the ad catalog');
  return { catalog, slot };
}

function mount(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function fillDetails() {
  fireEvent.change(screen.getByLabelText('Ad title'), { target: { value: 'Mama Put Jollof' } });
  fireEvent.change(screen.getByLabelText('Link'), { target: { value: 'https://mamaput.ng' } });
  fireEvent.click(screen.getByRole('checkbox'));
}

beforeEach(() => {
  createCampaign.mockReset().mockReturnValue(new Promise<CampaignCheckoutDto>(() => {}));
});
afterEach(cleanup);

describe('booking an ad in dollars', () => {
  it('shows no currency choice when the server takes naira only, and books in naira as before', async () => {
    const { catalog, slot } = catalogFor(15_000_000, null);
    mount(<DetailsStep slot={slot} catalog={catalog} creative={creative} />);
    expect(screen.queryByText('Pay in')).toBeNull();
    fillDetails();
    fireEvent.click(screen.getByRole('button', { name: 'Pay ₦150,000' }));
    await waitFor(() => expect(createCampaign).toHaveBeenCalledTimes(1));
    const body = createCampaign.mock.calls[0]?.[0];
    expect(body).toMatchObject({ slotId: 'mmia-arrivals', blocks: 1, expectedStartDate: TODAY, expectedPriceKobo: 15_000_000 });
    expect(body).not.toHaveProperty('currency');
  });

  it('shows the naira total and its dollar price, and pays the dollar price', async () => {
    const { catalog, slot } = catalogFor(15_000_000, usd);
    mount(<DetailsStep slot={slot} catalog={catalog} creative={creative} />);
    expect(screen.getByRole('radio', { name: 'Naira, ₦150,000' })).toBeTruthy();
    const dollars = screen.getByRole('radio', { name: 'Dollars, $100' }) as HTMLInputElement;
    expect(dollars.disabled).toBe(false);

    fillDetails();
    fireEvent.click(dollars);
    expect(screen.getByText('You pay in dollars')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pay $100' }));
    await waitFor(() =>
      expect(createCampaign).toHaveBeenCalledWith(
        expect.objectContaining({ expectedPriceKobo: 15_000_000, currency: 'USD', method: 'card', expectedNgnPerUsd: 1_500, expectedStartDate: TODAY }),
      ),
    );
  });

  it('turns dollars off with a note when the price is under $1', () => {
    // ₦2,000 at ₦5,000 per $1 = $0.40.
    const { catalog, slot } = catalogFor(200_000, { ...usd, ngnPerUsd: 5_000 });
    mount(<DetailsStep slot={slot} catalog={catalog} creative={creative} />);
    expect((screen.getByRole('radio', { name: 'Dollars' }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('Under $1: pay in naira')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pay ₦2,000' })).toBeTruthy();
  });
});

describe('dollar amounts after booking', () => {
  it('shows a dollar receipt in dollars, with the naira price and the rate, and the refund in dollars', () => {
    const receipt: PromotionReceiptDto = {
      amountKobo: 15_000_000,
      currency: 'USD',
      chargedMinor: 10_000,
      ngnPerUsd: 1_500,
      refundedMinor: 10_000,
      blocks: 1,
      blockDays: 7,
      blockPriceKobo: 15_000_000,
      paymentReference: 'ref-1',
      paidAt: '2026-10-09T10:05:00.000Z',
      refundedKobo: 15_000_000,
    };
    render(<ReceiptCard receipt={receipt} />);
    const paid = screen.getByText('You paid (real money)').nextElementSibling;
    expect(paid?.textContent).toBe('$100');
    expect(screen.getByText('In naira').nextElementSibling?.textContent).toBe('₦150,000 at ₦1,500 per $1');
    expect(screen.getByText('Refunded').nextElementSibling?.textContent).toBe('$100');
  });

  it('keeps a naira receipt exactly as before', () => {
    const receipt: PromotionReceiptDto = {
      amountKobo: 15_000_000,
      currency: 'NGN',
      chargedMinor: 15_000_000,
      ngnPerUsd: null,
      refundedMinor: 0,
      blocks: 1,
      blockDays: 7,
      blockPriceKobo: 15_000_000,
      paymentReference: null,
      paidAt: null,
      refundedKobo: 0,
    };
    render(<ReceiptCard receipt={receipt} />);
    expect(screen.getByText('You paid (real money)').nextElementSibling?.textContent).toBe('₦150,000');
    expect(screen.queryByText('In naira')).toBeNull();
  });
});
