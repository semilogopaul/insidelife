import type { UsdPaymentOptionsDto } from '@insidelife/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PayInPicker } from '../PayInPicker';
import { PaymentAmount } from '../PaymentAmount';
import { usePaymentChoice } from '../use-payment-choice';

const usd: UsdPaymentOptionsDto = { ngnPerUsd: 1_500, methods: ['card', 'applepay', 'googlepay'], minChargeCents: 100 };

function Harness({ options, allowed = true, note = null }: { readonly options: UsdPaymentOptionsDto | null; readonly allowed?: boolean; readonly note?: string | null }) {
  const payment = usePaymentChoice(options, allowed);
  return (
    <>
      <PayInPicker usd={options} payment={payment} nairaPrice="₦150,000" dollarPrice="$100" dollarNote={note} />
      <output aria-label="paying">{`${payment.currency}/${payment.method}`}</output>
    </>
  );
}

afterEach(() => {
  cleanup();
  delete (window as unknown as Record<string, unknown>).ApplePaySession;
});

describe('PayInPicker', () => {
  it('shows nothing when the server takes naira only', () => {
    render(<Harness options={null} />);
    expect(screen.queryByText('Pay in')).toBeNull();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByLabelText('paying').textContent).toBe('NGN/card');
  });

  it('offers ₦ / $ with both prices, naira first, and the methods for dollars', () => {
    render(<Harness options={usd} />);
    const naira = screen.getByRole('radio', { name: 'Naira, ₦150,000' }) as HTMLInputElement;
    const dollars = screen.getByRole('radio', { name: 'Dollars, $100' }) as HTMLInputElement;
    expect(naira.checked).toBe(true);
    expect(screen.queryByText('Pay with')).toBeNull();

    fireEvent.click(dollars);
    expect(dollars.checked).toBe(true);
    expect(screen.getByLabelText('paying').textContent).toBe('USD/card');
    expect(screen.getByText(/₦1,500 per \$1\. International cards are charged in dollars by Flutterwave/)).toBeTruthy();
    // No ApplePaySession in this browser: card and Google Pay only.
    expect(screen.getAllByRole('radio', { name: /Card|Apple Pay|Google Pay/ }).map((radio) => radio.parentElement?.textContent)).toEqual(['Card', 'Google Pay']);
    fireEvent.click(screen.getByRole('radio', { name: 'Google Pay' }));
    expect(screen.getByLabelText('paying').textContent).toBe('USD/googlepay');
  });

  it('shows Apple Pay in Safari', () => {
    (window as unknown as Record<string, unknown>).ApplePaySession = function ApplePaySession() {};
    render(<Harness options={usd} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Dollars, $100' }));
    expect(screen.getByRole('radio', { name: 'Apple Pay' })).toBeTruthy();
  });

  it('disables dollars with a note when the price is under the smallest dollar charge', () => {
    render(<Harness options={usd} allowed={false} note="Under $1: pay in naira" />);
    const dollars = screen.getByRole('radio', { name: 'Dollars' }) as HTMLInputElement;
    expect(dollars.disabled).toBe(true);
    expect(screen.getByText('Under $1: pay in naira')).toBeTruthy();
    expect(screen.getByLabelText('paying').textContent).toBe('NGN/card');
  });
});

describe('PaymentAmount', () => {
  it('shows an amount in the currency it was paid in', () => {
    const { container, rerender } = render(<PaymentAmount currency="NGN" minor={250_000} />);
    expect(container.textContent).toBe('₦2,500');
    rerender(<PaymentAmount currency="USD" minor={667} />);
    expect(container.textContent).toBe('$6.67');
    rerender(<PaymentAmount currency="USD" minor={10_000} nairaKobo={15_000_000} />);
    expect(container.textContent).toBe('$100 (₦150,000)');
  });
});
