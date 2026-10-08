'use client';

import { useState } from 'react';
import type { GameMinute, PlayerProfileDto } from '@insidelife/shared';
import { Spinner } from '@/common/components';
import { gameClock } from '@/common/game/game-clock';
import { useRecipient } from '../../hooks/use-recipient';
import { useTransfer } from '../../hooks/use-transfer';
import { useWallet } from '../../hooks/use-wallet';
import { newIdempotencyKey } from '@/common/utils/money-input';
import { describeTransferError, type TransferFailure } from '../../services/transfer-errors';
import { ScreenHeader } from '../ScreenHeader';
import { AmountStep } from './AmountStep';
import { ReceiptStep } from './ReceiptStep';
import { RecipientStep } from './RecipientStep';
import { ReviewStep } from './ReviewStep';

type Step = 'recipient' | 'amount' | 'review' | 'receipt';

const TITLES: Readonly<Record<Step, string>> = { recipient: 'Send money', amount: 'How much?', review: 'Confirm', receipt: 'Receipt' };

export interface SendFlowProps {
  readonly onExit: () => void;
  readonly onTopUp: () => void;
  readonly onSavings: () => void;
}

/** @handle → recipient card → amount (fees + limit) → note + hold to send → receipt. */
export function SendFlow({ onExit, onTopUp, onSavings }: SendFlowProps) {
  const [step, setStep] = useState<Step>('recipient');
  const [handle, setHandle] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState('');
  /** One key per intent (recipient + amount): reused for retries, dropped when either changes. */
  const [intentKey, setIntentKey] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<GameMinute>(0);
  const wallet = useWallet();
  const recipient = useRecipient(handle);
  const transfer = useTransfer();

  const reset = (): void => {
    setStep('recipient');
    setHandle(null);
    setAmount(null);
    setNote('');
    setIntentKey(null);
    transfer.reset();
  };

  const back = (): void => {
    if (step === 'recipient' || step === 'receipt') return step === 'receipt' ? reset() : onExit();
    setIntentKey(null);
    transfer.reset();
    setStep(step === 'review' ? 'amount' : 'recipient');
  };

  const failure: TransferFailure | null = transfer.isError && handle ? describeTransferError(transfer.error, handle) : null;

  const fix = (action: TransferFailure['fix']): void => {
    transfer.reset();
    setIntentKey(null);
    if (action === 'edit-amount') setStep('amount');
    else if (action === 'change-recipient') {
      setHandle(null);
      setStep('recipient');
    } else if (action === 'top-up') onTopUp();
    else reset();
  };

  const send = (profile: PlayerProfileDto, value: number): void => {
    const key = intentKey ?? newIdempotencyKey();
    setIntentKey(key);
    transfer.mutate(
      { toHandle: profile.handle, amount: value, note: note.trim() || undefined, idempotencyKey: key },
      {
        onSuccess: () => {
          setSentAt(gameClock.now());
          setStep('receipt');
        },
      },
    );
  };

  const header = <ScreenHeader title={TITLES[step]} onBack={step === 'receipt' ? onExit : back} backLabel={step === 'recipient' || step === 'receipt' ? 'Back to Bank' : 'Previous step'} aside={<StepDots step={step} />} />;

  if (step === 'receipt' && transfer.data) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <ReceiptStep receipt={transfer.data} note={note.trim()} sentAt={sentAt} onDone={onExit} onSendAnother={reset} />
      </div>
    );
  }

  if (step === 'recipient' || !handle) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <RecipientStep
          initialHandle={handle}
          onSavings={onSavings}
          onConfirm={(confirmed) => {
            setHandle(confirmed);
            setStep('amount');
          }}
        />
      </div>
    );
  }

  if (!wallet.data || !recipient.data) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <div className="grid place-items-center py-16 text-text-soft">
          <Spinner />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {header}
      {step === 'amount' || amount === null ? (
        <AmountStep
          recipient={recipient.data}
          wallet={wallet.data}
          amount={amount}
          onAmount={setAmount}
          onChangeRecipient={() => setStep('recipient')}
          onContinue={() => setStep('review')}
          onTopUp={onTopUp}
        />
      ) : (
        <ReviewStep
          recipient={recipient.data}
          wallet={wallet.data}
          amount={amount}
          note={note}
          onNote={setNote}
          sending={transfer.isPending}
          failure={failure}
          onSend={() => send(recipient.data, amount)}
          onFix={fix}
        />
      )}
    </div>
  );
}

const ORDER: readonly Step[] = ['recipient', 'amount', 'review', 'receipt'];

function StepDots({ step }: { readonly step: Step }) {
  const index = ORDER.indexOf(step);
  return (
    <span className="flex items-center gap-1" aria-label={`Step ${index + 1} of ${ORDER.length}`} role="img">
      {ORDER.map((item, i) => (
        <span key={item} className={i <= index ? 'h-1.5 w-4 rounded-full bg-ink' : 'h-1.5 w-1.5 rounded-full bg-paper-3'} />
      ))}
    </span>
  );
}
