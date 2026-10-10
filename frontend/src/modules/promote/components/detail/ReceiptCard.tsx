'use client';

import { Copy } from 'lucide-react';
import { formatNaira, koboToNaira, runLengthLabel, type PromotionReceiptDto } from '@insidelife/shared';
import { Money, toast } from '@/common/components';
import { PaymentAmount } from '@/common/payments';

const when = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

/** The receipt: blocks × block price, the total charged, when, the payment reference (copyable) and any refund. */
export function ReceiptCard({ receipt }: { readonly receipt: PromotionReceiptDto }) {
  const copy = async (): Promise<void> => {
    if (!receipt.paymentReference) return;
    try {
      await navigator.clipboard.writeText(receipt.paymentReference);
      toast({ title: 'Reference copied', body: 'Quote it to support if anything looks wrong.', tone: 'neutral' });
    } catch {
      toast({ title: 'Couldn’t copy', body: receipt.paymentReference, tone: 'neutral' });
    }
  };
  const blockLabel = receipt.blockDays === 7 ? 'week' : `${receipt.blockDays} days`;
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 rounded-card bg-paper-2 p-3.5 text-sm">
      <dt className="text-text-soft">
        <Money amount={koboToNaira(receipt.blockPriceKobo)} /> per {blockLabel} × {receipt.blocks}
      </dt>
      <dd className="tabular text-right">{runLengthLabel(receipt.blocks * receipt.blockDays)}</dd>
      <dt className="font-bold">You paid (real money)</dt>
      <dd className="type-figure text-right text-lg">
        <PaymentAmount currency={receipt.currency} minor={receipt.chargedMinor} />
      </dd>
      {receipt.currency === 'USD' && (
        <>
          <dt className="text-text-soft">In naira</dt>
          <dd className="tabular text-right text-text-soft">
            {formatNaira(koboToNaira(receipt.amountKobo))}
            {receipt.ngnPerUsd ? ` at ${formatNaira(receipt.ngnPerUsd)} per $1` : ''}
          </dd>
        </>
      )}
      {receipt.paidAt && (
        <>
          <dt className="text-text-soft">Paid</dt>
          <dd className="text-right">{when.format(new Date(receipt.paidAt))}</dd>
        </>
      )}
      {receipt.refundedMinor > 0 && (
        <>
          <dt className="text-text-soft">Refunded</dt>
          <dd className="text-right font-bold text-naira">
            <PaymentAmount currency={receipt.currency} minor={receipt.refundedMinor} />
          </dd>
        </>
      )}
      {receipt.paymentReference && (
        <>
          <dt className="self-center text-text-soft">Reference</dt>
          <dd className="flex min-w-0 items-center justify-end gap-1">
            <span className="tabular truncate text-xs" title={receipt.paymentReference}>
              {receipt.paymentReference}
            </span>
            <button type="button" onClick={() => void copy()} className="grid size-9 shrink-0 place-items-center rounded-full text-text-soft hover:bg-paper-3" aria-label="Copy payment reference">
              <Copy size={15} aria-hidden />
            </button>
          </dd>
        </>
      )}
    </dl>
  );
}
