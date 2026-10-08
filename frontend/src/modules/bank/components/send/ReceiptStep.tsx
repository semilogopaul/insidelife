'use client';

import { motion, useReducedMotion } from 'motion/react';
import { Check, Copy, Share2 } from 'lucide-react';
import { useState } from 'react';
import { formatClock12, formatDate, formatNaira, type GameMinute, type TransferResultDto } from '@insidelife/shared';
import { Button, Money, toast } from '@/common/components';

export interface ReceiptStepProps {
  readonly receipt: TransferResultDto;
  readonly note: string;
  readonly sentAt: GameMinute;
  readonly onDone: () => void;
  readonly onSendAnother: () => void;
}

/** The plain-text version people paste into a chat ("send me proof of payment"). */
export function receiptText(receipt: TransferResultDto, note: string, sentAt: GameMinute): string {
  return [
    'Inside Life Bank — transfer receipt',
    `${formatNaira(receipt.amount)} to ${receipt.recipient.name} (@${receipt.recipient.handle})`,
    note ? `Note: ${note}` : null,
    `Charges: ${formatNaira(receipt.fee + receipt.stampDuty)}`,
    `${formatDate(sentAt)}, ${formatClock12(sentAt)}`,
    `Ref: ${receipt.transferId}`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

/** Proof of payment, styled like a ticket stub. */
export function ReceiptStep({ receipt, note, sentAt, onDone, onSendAnother }: ReceiptStepProps) {
  const reduceMotion = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const share = async (): Promise<void> => {
    const text = receiptText(receipt, note, sentAt);
    try {
      if (canShare) {
        await navigator.share({ title: 'Transfer receipt', text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ title: 'Receipt copied', body: 'Paste it in a chat as proof of payment.', tone: 'neutral' });
    } catch {
      // Share sheet dismissed or clipboard blocked: nothing to undo.
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <motion.section
        aria-labelledby="receipt-title"
        initial={reduceMotion ? false : { y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="relative overflow-hidden rounded-sheet bg-paper-2 ring-1 ring-line"
      >
        <div className="flex flex-col items-center px-5 pb-5 pt-6 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-naira text-white shadow-[0_6px_18px_rgb(15_138_79/0.35)]">
            <Check size={30} strokeWidth={3} aria-hidden />
          </span>
          <h3 id="receipt-title" className="type-title mt-3 text-lg">
            Sent to {receipt.recipient.name}
          </h3>
          <p className="type-figure mt-1 text-[2.6rem] leading-none">
            <Money amount={receipt.amount} />
          </p>
          <p className="mt-1.5 text-sm text-text-soft">@{receipt.recipient.handle} has been alerted.</p>
        </div>
        <div aria-hidden className="relative h-5">
          <span className="absolute -left-2.5 top-0 size-5 rounded-full bg-paper ring-1 ring-line" />
          <span className="absolute -right-2.5 top-0 size-5 rounded-full bg-paper ring-1 ring-line" />
          <span className="absolute inset-x-5 top-1/2 border-t-2 border-dashed border-line" />
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-5 pb-5 pt-2 text-sm">
          <dt className="text-text-soft">Charges</dt>
          <dd className="tabular text-right">
            {receipt.fee + receipt.stampDuty === 0 ? 'Free' : <Money amount={receipt.fee + receipt.stampDuty} />}
          </dd>
          <dt className="text-text-soft">Cash left</dt>
          <dd className="tabular text-right font-bold">
            <Money amount={receipt.balanceAfter} />
          </dd>
          {note && (
            <>
              <dt className="text-text-soft">Note</dt>
              <dd className="truncate text-right">“{note}”</dd>
            </>
          )}
          <dt className="text-text-soft">When</dt>
          <dd className="text-right">
            {formatDate(sentAt)}, {formatClock12(sentAt)}
          </dd>
          <dt className="text-text-soft">Reference</dt>
          <dd className="tabular truncate text-right text-xs" title={receipt.transferId}>
            {receipt.transferId.slice(0, 8).toUpperCase()}
          </dd>
        </dl>
      </motion.section>
      <Button variant="paper" block icon={canShare ? <Share2 size={18} aria-hidden /> : copied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />} onClick={() => void share()}>
        {canShare ? 'Share receipt' : copied ? 'Copied' : 'Copy receipt'}
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="paper" onClick={onSendAnother}>
          Send again
        </Button>
        <Button onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}
