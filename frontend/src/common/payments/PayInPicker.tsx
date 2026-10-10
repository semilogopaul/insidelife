'use client';

import { useId, type ReactNode } from 'react';
import type { PaymentCurrency, PaymentMethod, UsdPaymentOptionsDto } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';
import { dollarMethodsLine, PAYMENT_METHOD_LABELS, rateLine } from './currency';
import type { PaymentChoiceControl } from './use-payment-choice';

export interface PayInPickerProps {
  /** Dollar options from the server; null hides the picker (naira only, exactly as before). */
  readonly usd: UsdPaymentOptionsDto | null;
  readonly payment: PaymentChoiceControl;
  /** The price in each currency, on its option ("₦150,000", "$100"); omit before an amount is picked. */
  readonly nairaPrice?: string | null;
  readonly dollarPrice?: string | null;
  /** Why dollars can't be picked for this price ("Under $1: pay in naira"). */
  readonly dollarNote?: string | null;
  /** Under the naira option (default: card, bank transfer or USSD). */
  readonly nairaHint?: string;
  /** Called after the player switches currency (e.g. to clear an amount picked in the other one). */
  readonly onCurrencyChange?: (currency: PaymentCurrency) => void;
  readonly className?: string;
}

/**
 * "Pay in ₦ Naira / $ Dollars", then (for dollars) how: card, Apple Pay or Google Pay where offered. Only shown when the
 * server takes dollars. The game stays in naira; dollars are only a way to pay.
 */
export function PayInPicker({ usd, payment, nairaPrice, dollarPrice, dollarNote, nairaHint = 'Card, bank transfer or USSD', onCurrencyChange, className }: PayInPickerProps) {
  const name = useId();
  if (!usd) return null;
  const pick = (currency: PaymentCurrency): void => {
    payment.chooseCurrency(currency);
    onCurrencyChange?.(currency);
  };
  const dollars = payment.currency === 'USD';

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <fieldset>
        <legend className="mb-1.5 text-sm font-bold">Pay in</legend>
        <div className="grid grid-cols-2 gap-2">
          <CurrencyOption
            name={name}
            symbol="₦"
            label="Naira"
            price={nairaPrice}
            hint={nairaHint}
            checked={!dollars}
            disabled={false}
            onPick={() => pick('NGN')}
          />
          <CurrencyOption
            name={name}
            symbol="$"
            label="Dollars"
            price={payment.dollarsOpen ? dollarPrice : null}
            hint={dollarNote ?? dollarMethodsLine(payment.methods)}
            warn={dollarNote != null}
            checked={dollars}
            disabled={!payment.dollarsOpen}
            onPick={() => pick('USD')}
          />
        </div>
      </fieldset>

      {dollars && payment.methods.length > 1 && <MethodPicker methods={payment.methods} method={payment.method} onPick={payment.chooseMethod} />}
      {dollars && (
        <p className="text-xs text-text-soft">
          {rateLine(usd.ngnPerUsd)}. International cards are charged in dollars by Flutterwave. Your game money stays in naira.
        </p>
      )}
    </div>
  );
}

interface CurrencyOptionProps {
  readonly name: string;
  readonly symbol: string;
  readonly label: string;
  readonly price?: string | null;
  readonly hint: ReactNode;
  readonly warn?: boolean;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onPick: () => void;
}

function CurrencyOption({ name, symbol, label, price, hint, warn = false, checked, disabled, onPick }: CurrencyOptionProps) {
  const hintId = useId();
  return (
    <label
      className={cn(
        'flex cursor-pointer flex-col gap-0.5 rounded-card p-3 ring-2 transition-[box-shadow,background-color] has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-danfo has-[:focus-visible]:outline-solid',
        checked ? 'bg-danfo-soft ring-danfo' : 'bg-paper-2 ring-transparent hover:bg-paper-3',
        disabled && 'cursor-not-allowed opacity-60 hover:bg-paper-2',
      )}
    >
      <input
        type="radio"
        name={name}
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={onPick}
        aria-label={price ? `${label}, ${price}` : label}
        aria-describedby={hintId}
      />
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold">
          <span aria-hidden className="type-figure mr-1">
            {symbol}
          </span>
          {label}
        </span>
        {price && <span className="type-figure text-sm">{price}</span>}
      </span>
      <span id={hintId} className={cn('text-2xs', warn ? 'font-bold text-okada' : 'text-text-soft')}>
        {hint}
      </span>
    </label>
  );
}

function MethodPicker({ methods, method, onPick }: { readonly methods: readonly PaymentMethod[]; readonly method: PaymentMethod; readonly onPick: (method: PaymentMethod) => void }) {
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-bold">Pay with</legend>
      <div className="flex flex-wrap gap-1.5">
        {methods.map((option) => (
          <label
            key={option}
            className={cn(
              'inline-flex h-9 cursor-pointer items-center rounded-full px-3 text-sm font-bold ring-1 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-danfo has-[:focus-visible]:outline-solid',
              method === option ? 'bg-ink text-on-ink ring-ink' : 'bg-paper ring-line hover:bg-paper-2',
            )}
          >
            <input type="radio" name={name} className="sr-only" checked={method === option} onChange={() => onPick(option)} />
            {PAYMENT_METHOD_LABELS[option]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
