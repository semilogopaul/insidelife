import { formatNairaCompact, type GoalProgressDto } from '@insidelife/shared';

/** "3 / 10", "₦120k / ₦500k", "17 / 18 years"; null for single-step goals (no bar). */
export function formatProgress(progress: GoalProgressDto): string | null {
  const current = Math.min(progress.current, progress.target);
  switch (progress.unit) {
    case 'step':
      return null;
    case 'naira':
      return `${formatNairaCompact(current)} / ${formatNairaCompact(progress.target)}`;
    case 'years':
      return `${current} / ${progress.target} years`;
    default:
      return `${current.toLocaleString('en-NG')} / ${progress.target.toLocaleString('en-NG')}`;
  }
}

export function progressRatio(progress: GoalProgressDto | null): number {
  if (!progress || progress.target <= 0) return 0;
  return Math.max(0, Math.min(1, progress.current / progress.target));
}
