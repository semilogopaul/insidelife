'use client';

import { Check, Undo2, X } from 'lucide-react';
import { useId, useState } from 'react';
import { errorMessage } from '@/common/api/api-error';
import { Button } from '@/common/components';
import { cn } from '@/common/utils/cn';
import type { Decision } from '../hooks/use-moderation';
import type { ModerationKind } from '../services/moderation.api';
import { reasonProblem } from '../services/queue';

const QUICK_REASONS = [
  'The image is hard to read at billboard size.',
  'The link doesn’t match what the ad shows.',
  'This looks like a scam or “double your money” offer.',
  'Gambling and betting ads aren’t allowed.',
  'You can only advertise brands you own or represent.',
] as const;

export interface DecisionPanelProps {
  readonly kind: ModerationKind;
  readonly id: string;
  readonly busy: boolean;
  readonly error: unknown;
  readonly onDecide: (decision: Decision) => void;
}

/** Approve in one press; rejecting needs a reason the buyer will read and an explicit refund choice. */
export function DecisionPanel({ kind, id, busy, error, onDecide }: DecisionPanelProps) {
  const reasonId = useId();
  const [mode, setMode] = useState<'idle' | 'rejecting'>('idle');
  const [reason, setReason] = useState('');
  const [refund, setRefund] = useState(true);
  const [touched, setTouched] = useState(false);
  const problem = reasonProblem(reason);

  return (
    <section aria-label="Decision" className="flex flex-col gap-3 rounded-sheet bg-paper-2 p-4">
      {mode === 'idle' ? (
        <div className="flex flex-wrap gap-2">
          <Button size="lg" icon={<Check size={20} aria-hidden />} loading={busy} onClick={() => onDecide({ action: 'approve', kind, id })} className="min-w-44">
            Approve
          </Button>
          <Button size="lg" variant="paper" icon={<X size={20} aria-hidden />} disabled={busy} onClick={() => setMode('rejecting')}>
            Reject…
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (!problem) onDecide({ action: 'reject', kind, id, reason, refund });
          }}
        >
          <label htmlFor={reasonId} className="text-sm font-bold">
            Reason (the buyer sees this)
          </label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            onBlur={() => setTouched(true)}
            rows={3}
            maxLength={300}
            autoFocus
            aria-invalid={touched && problem ? true : undefined}
            aria-describedby={`${reasonId}-hint`}
            className={cn('rounded-card bg-paper p-3 ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink', touched && problem && 'ring-2 ring-okada')}
          />
          <p id={`${reasonId}-hint`} className={cn('text-xs', touched && problem ? 'font-bold text-okada' : 'text-text-soft')}>
            {touched && problem ? problem : `${300 - reason.length} characters left. Plain words: what's wrong and what would pass.`}
          </p>
          {kind === 'campaigns' && (
            <div className="flex flex-wrap gap-1.5" aria-label="Common reasons">
              {QUICK_REASONS.map((quick) => (
                <button key={quick} type="button" onClick={() => setReason(quick)} className="rounded-full bg-paper px-2.5 py-1 text-xs ring-1 ring-line hover:bg-paper-3">
                  {quick}
                </button>
              ))}
            </div>
          )}
          <fieldset className="flex flex-col gap-1.5 text-sm">
            <legend className="mb-1 font-bold">Refund</legend>
            <label className="flex items-start gap-2">
              <input type="radio" name={`${reasonId}-refund`} checked={refund} onChange={() => setRefund(true)} className="mt-1 accent-[var(--color-ink)]" />
              <span>
                <strong>Refund in full</strong> (recommended). Moves to “Refunds due” for ops to refund in Paystack.
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" name={`${reasonId}-refund`} checked={!refund} onChange={() => setRefund(false)} className="mt-1 accent-[var(--color-okada)]" />
              <span>
                <strong>No refund</strong> — only for fraud or repeat abuse.
              </span>
            </label>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" size="lg" loading={busy} icon={refund ? <Undo2 size={18} aria-hidden /> : <X size={18} aria-hidden />}>
              {refund ? 'Reject and refund' : 'Reject without refund'}
            </Button>
            <Button variant="paper" size="lg" disabled={busy} onClick={() => setMode('idle')}>
              Back
            </Button>
          </div>
        </form>
      )}
      {error !== null && error !== undefined && (
        <p role="alert" className="rounded-card bg-okada-soft p-3 text-sm text-okada">
          {errorMessage(error)}
        </p>
      )}
    </section>
  );
}
