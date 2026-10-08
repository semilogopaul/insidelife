import { X } from 'lucide-react';
import { formatGameDuration, type ActionDefinition, type TimelineSegmentDto } from '@insidelife/shared';

/** What you're doing right now, with a progress bar in game time and (for explicit actions) a cancel button. */
export function ActivityBanner({ segment, action, minute, onCancel, cancelling }: {
  readonly segment: TimelineSegmentDto;
  readonly action: ActionDefinition | undefined;
  readonly minute: number;
  readonly onCancel: () => void;
  readonly cancelling: boolean;
}) {
  const total = Math.max(1, segment.endsAt - segment.startsAt);
  const progress = Math.min(1, Math.max(0, (minute - segment.startsAt) / total));
  const remaining = Math.max(0, segment.endsAt - minute);
  const cancellable = segment.explicit && segment.kind === 'action' && action !== undefined && !action.system;
  return (
    <div className="glass flex min-w-0 items-center gap-3 rounded-card py-2 pl-3.5 pr-2">
      <span aria-hidden className="text-xl">{action?.emoji ?? '⏳'}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-on-ink">{segment.label}</p>
        <div className="mt-1 flex items-center gap-2">
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/12">
            <div className="h-full rounded-full bg-danfo" style={{ width: `${progress * 100}%` }} />
          </div>
          <span className="tabular text-2xs text-on-ink-soft">{formatGameDuration(remaining)} left</span>
        </div>
      </div>
      {cancellable && (
        <button type="button" onClick={onCancel} disabled={cancelling} aria-label="Stop this activity" className="grid size-9 place-items-center rounded-full hover:bg-white/10">
          <X size={18} aria-hidden />
        </button>
      )}
    </div>
  );
}
