'use client';

import { CircleAlert } from 'lucide-react';
import { formatNaira, transferFee, type PlayerProfileDto, type WalletDto } from '@insidelife/shared';
import { Button, HoldButton, Money, Spinner, TextField } from '@/common/components';
import type { TransferFailure } from '../../services/transfer-errors';
import { ChargesBreakdown } from './ChargesBreakdown';
import { RecipientCard } from './RecipientCard';

export const NOTE_MAX = 80;

export interface ReviewStepProps {
  readonly recipient: PlayerProfileDto;
  readonly wallet: WalletDto;
  readonly amount: number;
  readonly note: string;
  readonly onNote: (note: string) => void;
  readonly sending: boolean;
  readonly failure: TransferFailure | null;
  readonly onSend: () => void;
  readonly onFix: (fix: TransferFailure['fix']) => void;
}

/** Last look: who, how much, what it costs, an optional note — then hold to send. */
export function ReviewStep({ recipient, wallet, amount, note, onNote, sending, failure, onSend, onFix }: ReviewStepProps) {
  const charges = transferFee(amount);
  const balanceAfter = wallet.balance - amount - charges.total;
  return (
    <div className="flex flex-col gap-4">
      <RecipientCard person={recipient} />
      <div className="rounded-sheet bg-paper p-4 ring-1 ring-line">
        <p className="text-center text-sm font-bold text-text-soft">You’re sending</p>
        <p className="type-figure text-center text-[2.5rem] leading-tight">
          <Money amount={amount} />
        </p>
        <ChargesBreakdown amount={amount} fee={charges.fee} stampDuty={charges.stampDuty} extra={[{ label: 'Cash left after', value: <Money amount={balanceAfter} /> }]} className="mt-3" />
      </div>
      <TextField
        label="Note (optional)"
        placeholder={`e.g. “Your share of the suya”`}
        value={note}
        maxLength={NOTE_MAX}
        onChange={(event) => onNote(event.target.value)}
        hint={`${recipient.firstName} sees this in their alert. ${NOTE_MAX - note.length} characters left.`}
      />
      {failure && (
        <div role="alert" className="flex gap-3 rounded-card bg-okada-soft p-3.5">
          <CircleAlert size={20} aria-hidden className="mt-0.5 shrink-0 text-okada" />
          <div className="min-w-0 text-sm">
            <p className="font-bold text-okada">{failure.title}</p>
            <p className="mt-0.5 text-text-soft">{failure.body}</p>
            {failure.fix !== 'retry' && (
              <Button variant="paper" size="sm" className="mt-2" onClick={() => onFix(failure.fix)}>
                {FIX_LABELS[failure.fix]}
              </Button>
            )}
          </div>
        </div>
      )}
      <div className="sticky bottom-0 -mx-1 bg-paper px-1 pb-1 pt-2">
        {sending ? (
          <div className="flex h-14 items-center justify-center gap-2 rounded-card bg-ink font-bold text-on-ink" role="status">
            <Spinner size={18} /> Sending {formatNaira(amount)}…
          </div>
        ) : (
          <HoldButton onConfirm={onSend}>{failure?.fix === 'retry' ? `Hold to try again` : `Hold to send ${formatNaira(amount)}`}</HoldButton>
        )}
        <p className="mt-1.5 text-center text-xs text-text-soft">Transfers are instant and can’t be reversed.</p>
      </div>
    </div>
  );
}

const FIX_LABELS: Readonly<Record<Exclude<TransferFailure['fix'], 'retry'>, string>> = {
  'edit-amount': 'Change the amount',
  'change-recipient': 'Choose someone else',
  'top-up': 'Top up your wallet',
  'start-over': 'Start again',
};
