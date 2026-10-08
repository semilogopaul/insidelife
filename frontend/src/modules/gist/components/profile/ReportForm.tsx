'use client';

import { useId, useState } from 'react';
import { PLAYER_REPORT_REASONS, PLAYER_REPORT_REASON_LABELS, REPORT_RULES, type PlayerProfileDto, type PlayerReportReason } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, toast } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { useFriendActions } from '../../hooks/use-social';

/** Report a player to moderators (optionally blocking them in the same step). */
export function ReportForm({ profile, onDone }: { readonly profile: PlayerProfileDto; readonly onDone: () => void }) {
  const [reason, setReason] = useState<PlayerReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const { report } = useFriendActions();
  const detailsId = useId();

  return (
    <form
      className="flex flex-col gap-3 pb-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!reason) return;
        report.mutate(
          { handle: profile.handle, reason, details: details.trim() || undefined, alsoBlock },
          {
            onSuccess: () => {
              toast({ title: 'Report sent', body: 'Thanks — a moderator will review it.', tone: 'neutral' });
              onDone();
            },
            onError: (error) => toast({ title: 'Couldn’t send the report', body: errorMessage(error), tone: 'bad' }),
          },
        );
      }}
    >
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 font-bold">What’s going on with @{profile.handle}?</legend>
        {PLAYER_REPORT_REASONS.map((item) => (
          <label key={item} className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-card px-3', reason === item ? 'bg-okada-soft ring-1 ring-okada' : 'bg-paper-2')}>
            <input type="radio" name="reason" value={item} checked={reason === item} onChange={() => setReason(item)} className="size-4 accent-[var(--color-okada)]" />
            <span className="text-sm font-bold">{PLAYER_REPORT_REASON_LABELS[item]}</span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={detailsId} className="text-sm font-bold">
          Anything else? (optional)
        </label>
        <textarea
          id={detailsId}
          value={details}
          maxLength={REPORT_RULES.detailsMaxLength}
          onChange={(event) => setDetails(event.target.value)}
          rows={3}
          className="rounded-card bg-paper-2 p-3 text-[1rem] ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink"
        />
      </div>
      <label className="flex items-center gap-3">
        <input type="checkbox" checked={alsoBlock} onChange={(event) => setAlsoBlock(event.target.checked)} className="size-5 accent-[var(--color-ink)]" />
        <span className="text-sm">Also block @{profile.handle}</span>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="paper" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" disabled={!reason} loading={report.isPending}>
          Send report
        </Button>
      </div>
    </form>
  );
}
