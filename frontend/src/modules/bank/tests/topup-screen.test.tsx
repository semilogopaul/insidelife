import { formatNaira, TOPUP_PACKAGES, topupVirtualAmountUsd, type PaymentDto, type TopupCatalogDto, type TopupStartedDto } from '@insidelife/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/common/api/api-error';
import { useSession } from '@/common/auth/session-store';
import { TopUpScreen } from '../components/topup/TopUpScreen';
import { bankApi } from '../services/bank.api';

vi.mock('../services/bank.api', () => ({ bankApi: { packages: vi.fn(), payments: vi.fn(), startTopup: vi.fn() } }));

const packages = vi.mocked(bankApi.packages);
const payments = vi.mocked(bankApi.payments);
const startTopup = vi.mocked(bankApi.startTopup);

const NAIRA_ONLY: TopupCatalogDto = {
  packages: TOPUP_PACKAGES,
  minNgn: 500,
  maxPerPaymentNgn: 10_000_000,
  dailyLimitNgn: null,
  spentTodayNgn: 0,
  remainingTodayNgn: null,
  usd: null,
  sandbox: false,
};

const WITH_DOLLARS: TopupCatalogDto = {
  ...NAIRA_ONLY,
  usd: { ngnPerUsd: 1_500, methods: ['card', 'googlepay'], minChargeCents: 100, minUsd: 1, maxPerPaymentUsd: 5_000, quickPicksUsd: [1, 5, 10, 25, 50] },
};

const dollarPayment: PaymentDto = {
  reference: '0f78b5db-d87d-4e94-9217-4ec62df2062a',
  purpose: 'topup',
  subjectId: 'custom',
  description: 'Inside Life top-up',
  currency: 'USD',
  amountMinor: 1_000,
  ngnPerUsd: 1_500,
  amountNgn: 15_000,
  amountKobo: 1_500_000,
  status: 'success',
  fulfilled: true,
  channel: 'card',
  createdAt: '2026-10-09T12:00:00.000Z',
  verifiedAt: '2026-10-09T12:01:00.000Z',
  refundedMinor: 0,
  refundedNgn: 0,
  topup: { packageId: null, label: 'Custom top-up', ratePerNaira: 300, virtualAmount: 4_500_000 },
};

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TopUpScreen onBack={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useSession.setState({ status: 'authenticated' });
  packages.mockReset();
  payments.mockReset().mockResolvedValue([]);
  // Never resolves: the screen would leave for checkout.
  startTopup.mockReset().mockReturnValue(new Promise<TopupStartedDto>(() => {}));
});
afterEach(cleanup);

describe('TopUpScreen paying in dollars', () => {
  it('shows no currency choice when the server takes naira only', async () => {
    packages.mockResolvedValue(NAIRA_ONLY);
    mount();
    await screen.findByRole('list', { name: 'Top-up packs' });
    expect(screen.queryByText('Pay in')).toBeNull();
    expect(screen.queryByRole('radio', { name: /Dollars/ })).toBeNull();
  });

  it('keeps naira as the default and sends a pack exactly as before', async () => {
    packages.mockResolvedValue(WITH_DOLLARS);
    mount();
    const packs = await screen.findByRole('list', { name: 'Top-up packs' });
    expect((screen.getByRole('radio', { name: 'Naira' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(packs).getAllByRole('button')[0] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: /Pay ₦.* with Flutterwave/ }));
    await waitFor(() => expect(startTopup).toHaveBeenCalledWith({ packageId: TOPUP_PACKAGES[0]?.id }));
  });

  it('sells whole dollars with the game naira they buy and sends the dollar intent', async () => {
    packages.mockResolvedValue(WITH_DOLLARS);
    mount();
    fireEvent.click(await screen.findByRole('radio', { name: 'Dollars' }));
    const picks = screen.getByRole('list', { name: 'Dollar top-ups' });
    expect(within(picks).getAllByRole('button').map((button) => button.textContent?.startsWith('$') && button.textContent.split('₦')[0])).toEqual(['$1', '$5', '$10', '$25', '$50']);

    fireEvent.click(within(picks).getAllByRole('button')[1] as HTMLElement);
    const confirm = screen.getByRole('region', { name: 'Confirm top-up' });
    expect(confirm.textContent).toContain(`You pay $5 real money and get ${formatNaira(topupVirtualAmountUsd(5, 1_500))} in your game wallet.`);
    expect(confirm.textContent).toContain('$5 = ₦7,500 at ₦1,500 per $1.');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Pay $5 with Flutterwave' }));
    await waitFor(() => expect(startTopup).toHaveBeenCalledWith({ amountUsd: 5, currency: 'USD', method: 'card', expectedNgnPerUsd: 1_500 }));
  });

  it('takes a custom whole-dollar amount and a wallet method', async () => {
    packages.mockResolvedValue(WITH_DOLLARS);
    mount();
    fireEvent.click(await screen.findByRole('radio', { name: 'Dollars' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Google Pay' }));
    fireEvent.change(screen.getByLabelText('Or pay any dollar amount'), { target: { value: '12' } });
    expect(screen.getByRole('region', { name: 'Custom dollar amount' }).textContent).toContain(`You get ${formatNaira(topupVirtualAmountUsd(12, 1_500))} in game (₦1,500 per $1)`);
    fireEvent.click(screen.getByRole('button', { name: 'Pay $12 with Google Pay' }));
    await waitFor(() => expect(startTopup).toHaveBeenCalledWith({ amountUsd: 12, currency: 'USD', method: 'googlepay', expectedNgnPerUsd: 1_500 }));
  });

  it('re-reads the catalog and says why when the rate changed before paying', async () => {
    packages.mockResolvedValueOnce(WITH_DOLLARS).mockResolvedValue({ ...WITH_DOLLARS, usd: { ...WITH_DOLLARS.usd!, ngnPerUsd: 1_600 } });
    startTopup.mockRejectedValue(new ApiError(409, { errorCode: 'RATE_CHANGED', message: 'The dollar rate just changed to ₦1,600 per $1. Check the new price and pay again.' }));
    mount();
    fireEvent.click(await screen.findByRole('radio', { name: 'Dollars' }));
    fireEvent.click(within(screen.getByRole('list', { name: 'Dollar top-ups' })).getAllByRole('button')[1] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Pay $5 with Flutterwave' }));

    expect((await screen.findByRole('alert')).textContent).toBe('The dollar rate just changed to ₦1,600 per $1. Check the new price and pay again.');
    await waitFor(() => expect(packages).toHaveBeenCalledTimes(2));
    await screen.findByText('$5 = ₦8,000 at ₦1,600 per $1.');
  });

  it('falls back to naira and says why when dollars were switched off meanwhile', async () => {
    packages.mockResolvedValueOnce(WITH_DOLLARS).mockResolvedValue(NAIRA_ONLY);
    startTopup.mockRejectedValue(new ApiError(400, { errorCode: 'PAYMENT_CURRENCY_UNAVAILABLE', message: 'Dollar payments are off right now. Pay in naira instead.' }));
    mount();
    fireEvent.click(await screen.findByRole('radio', { name: 'Dollars' }));
    fireEvent.click(within(screen.getByRole('list', { name: 'Dollar top-ups' })).getAllByRole('button')[0] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Pay $1 with Flutterwave' }));

    await screen.findByRole('list', { name: 'Top-up packs' });
    expect(screen.queryByRole('radio', { name: 'Dollars' })).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe('Dollar payments are off right now. Pay in naira instead.');
    expect(screen.queryByRole('region', { name: 'Confirm top-up' })).toBeNull();
  });

  it('shows a dollar payment in dollars in the history, with its naira value', async () => {
    packages.mockResolvedValue(NAIRA_ONLY);
    payments.mockResolvedValue([dollarPayment]);
    mount();
    const row = (await screen.findByText('Custom top-up')).closest('li') as HTMLElement;
    expect(within(row).getByText('$10')).toBeTruthy();
    expect(within(row).getByText('₦15,000')).toBeTruthy();
  });
});
