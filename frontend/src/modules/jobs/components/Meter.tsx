import type { ReactNode } from 'react';
import { ProgressBar } from '@/common/components';

/** A labelled 0-1 meter whose fill tone follows how healthy the value is. */
export function Meter({
  label,
  ratio,
  detail,
  invert = false,
}: {
  readonly label: string;
  readonly ratio: number;
  readonly detail?: ReactNode;
  readonly invert?: boolean;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  const good = invert ? pct <= 35 : pct >= 75;
  const bad = invert ? pct >= 70 : pct < 50;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-bold">{label}</span>
        <span className="tabular font-bold">{pct}%</span>
      </div>
      <ProgressBar value={pct} label={label} tone={good ? 'naira' : bad ? 'okada' : 'danfo'} />
      {detail && <p className="text-xs text-text-soft">{detail}</p>}
    </div>
  );
}
