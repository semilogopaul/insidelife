'use client';

import { Undo2 } from 'lucide-react';
import { useId, useState } from 'react';
import { errorMessage } from '@/common/api/api-error';
import { Button } from '@/common/components';
import type { Decision } from '../hooks/use-moderation';
import type { ModerationKind } from '../services/moderation.api';

/** Refunds happen in the Paystack dashboard; this records that they were done (with an optional note). */
export function RefundPanel({ kind, id, busy, error, onDecide }: { readonly kind: ModerationKind; readonly id: string; readonly busy: boolean; readonly error: unknown; readonly onDecide: (decision: Decision) => void }) {
  const noteId = useId();
  const [note, setNote] = useState('');
  return (
    <section aria-label="Refund" className="flex flex-col gap-3 rounded-sheet bg-ankara-soft p-4">
      <p className="text-sm">
        <strong>Refund due.</strong> Refund the full amount in the Paystack dashboard using the payment reference above, then mark it here so the buyer is told.
      </p>
      <label htmlFor={noteId} className="text-sm font-bold">
        Note (optional, for the ops log)
      </label>
      <input
        id={noteId}
        value={note}
        maxLength={300}
        onChange={(event) => setNote(event.target.value)}
        placeholder="e.g. Refunded via Paystack, ref RF-2291"
        className="h-11 rounded-card bg-paper px-3 ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink"
      />
      <Button size="lg" variant="ink" icon={<Undo2 size={18} aria-hidden />} loading={busy} onClick={() => onDecide({ action: 'refunded', kind, id, note })} className="self-start">
        Mark refunded
      </Button>
      {error !== null && error !== undefined && (
        <p role="alert" className="rounded-card bg-okada-soft p-3 text-sm text-okada">
          {errorMessage(error)}
        </p>
      )}
    </section>
  );
}
