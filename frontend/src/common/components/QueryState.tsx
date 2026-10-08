import { CloudOff } from 'lucide-react';
import { errorMessage } from '@/common/api/api-error';
import { Button } from './Button';

/** Skeleton rows while an app's data loads. */
export function LoadingRows({
  rows = 3,
  label = 'Loading',
}: {
  readonly rows?: number;
  readonly label?: string;
}) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-2.5 py-2">
      <span className="h-28 animate-pulse rounded-card bg-paper-2" />
      {Array.from({ length: rows }, (_, index) => (
        <span
          key={index}
          className="h-16 animate-pulse rounded-card bg-paper-2"
          style={{ animationDelay: `${index * 120}ms` }}
        />
      ))}
    </div>
  );
}

/** A failed load: what happened, in plain words, and a retry. */
export function ErrorState({ error, onRetry }: { readonly error: unknown; readonly onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-okada-soft text-okada">
        <CloudOff size={26} aria-hidden />
      </span>
      <p className="type-title mt-1 text-xl">Network no gree</p>
      <p className="max-w-xs text-sm text-text-soft">{errorMessage(error)}</p>
      <Button variant="paper" className="mt-2" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
