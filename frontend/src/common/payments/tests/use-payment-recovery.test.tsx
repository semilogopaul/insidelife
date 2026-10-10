import type { PaymentDto, PaymentVerificationDto } from '@insidelife/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/common/api/api-error';
import { useSession } from '@/common/auth/session-store';
import { useToasts } from '@/common/components/toast-store';
import { checkPayment, paymentsApi } from '../payments.api';
import { usePaymentRecovery } from '../use-payment-recovery';

vi.mock('../payments.api', () => ({ paymentsApi: { list: vi.fn() }, checkPayment: vi.fn() }));

const list = vi.mocked(paymentsApi.list);
const check = vi.mocked(checkPayment);
let now = Date.parse('2026-10-09T12:00:00Z');

const payment = (reference: string, overrides: Partial<PaymentDto> = {}): PaymentDto => ({
  reference,
  purpose: 'topup',
  subjectId: 'owambe-pack',
  description: 'Inside Life top-up: ₦1,000,000 in game (Owambe pack)',
  amountNgn: 2_500,
  amountKobo: 250_000,
  status: 'initialized',
  fulfilled: false,
  channel: null,
  createdAt: new Date(now - 3 * 60_000).toISOString(),
  verifiedAt: null,
  refundedNgn: 0,
  topup: { packageId: 'owambe-pack', label: 'Owambe pack', ratePerNaira: 400, virtualAmount: 1_000_000 },
  ...overrides,
});

function mount() {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { readonly children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => usePaymentRecovery(), { wrapper });
  return { hook, invalidate };
}

describe('usePaymentRecovery', () => {
  beforeEach(() => {
    now = Date.parse('2026-10-09T12:00:00Z');
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    useSession.setState({ status: 'authenticated' });
    useToasts.setState({ toasts: [] });
    list.mockReset();
    check.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('on mount, checks recent unconfirmed payments and announces one that landed', async () => {
    list.mockResolvedValue([payment('landed'), payment('paid-long-ago', { status: 'success', fulfilled: true }), payment('still-waiting')]);
    check.mockImplementation(async (reference): Promise<PaymentVerificationDto> =>
      reference === 'landed'
        ? { payment: payment('landed', { status: 'success', fulfilled: true }), fulfilledNow: true }
        : { payment: payment(reference), fulfilledNow: false },
    );
    const { invalidate } = mount();

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(4));
    expect(check.mock.calls.map(([reference]) => reference).toSorted()).toEqual(['landed', 'still-waiting']);
    expect(useToasts.getState().toasts).toEqual([expect.objectContaining({ title: 'Payment confirmed', body: '₦1,000,000 added to your wallet', tone: 'good', amount: 1_000_000 })]);
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([['wallet'], ['character', 'snapshot'], ['domain', 'bank'], ['domain', 'promote']]);
  });

  it('re-checks on focus and visibility, but not the same payment within 30 s', async () => {
    list.mockResolvedValue([payment('pending')]);
    check.mockResolvedValue({ payment: payment('pending'), fulfilledNow: false });
    const { invalidate } = mount();
    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));

    // Focus a moment later: one scan covers it.
    now += 1_000;
    act(() => void window.dispatchEvent(new Event('focus')));
    // Later focus: the list is read again, but the payment was checked 10 s ago.
    now += 9_000;
    act(() => void window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    await act(async () => undefined); // let that scan finish
    expect(check).toHaveBeenCalledTimes(1);

    // Back to the tab 30 s after the first check: checked again.
    now += 21_000;
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(check).toHaveBeenCalledTimes(2));
    expect(invalidate).not.toHaveBeenCalled();
    expect(useToasts.getState().toasts).toEqual([]);
  });

  it('stays quiet when a check can’t finish (the server keeps checking by itself)', async () => {
    list.mockResolvedValue([payment('a'), payment('b')]);
    check.mockRejectedValueOnce(new ApiError(502, { errorCode: 'PAYMENT_CHECK_UNAVAILABLE', message: 'x' })).mockResolvedValueOnce({ payment: payment('b', { status: 'failed' }), fulfilledNow: false });
    const { invalidate } = mount();
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
    expect(check).toHaveBeenCalledTimes(2);
    expect(useToasts.getState().toasts).toEqual([]);
  });

  it('does nothing until the player is signed in', async () => {
    useSession.setState({ status: 'anonymous' });
    mount();
    await act(async () => undefined);
    expect(list).not.toHaveBeenCalled();
  });
});
