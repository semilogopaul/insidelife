'use client';

import { ChevronLeft, ShieldCheck } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import type { ContentRule, ContentRuleScope, PromotionStatus } from '@insidelife/shared';
import { Badge } from '@/common/components';
import { STATUS_META } from '../services/status';

/** Status chip in words (never colour alone). */
export function StatusBadge({ status }: { readonly status: PromotionStatus }) {
  const meta = STATUS_META[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

/** Sub-screen header with a back step; focus lands on the title so the change is announced. */
export function StepHeader({ title, onBack, backLabel, aside }: { readonly title: string; readonly onBack: () => void; readonly backLabel: string; readonly aside?: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [title]);
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onBack} aria-label={backLabel} className="-ml-2 grid size-10 shrink-0 place-items-center rounded-full text-text-soft hover:bg-paper-2 hover:text-text">
        <ChevronLeft size={22} aria-hidden />
      </button>
      <h3 ref={heading} tabIndex={-1} className="type-title min-w-0 flex-1 truncate text-xl outline-none">
        {title}
      </h3>
      {aside}
    </div>
  );
}

/** The content rules, readable in full, plus the one checkbox that confirms them. */
export function ContentRules({
  rules,
  scope,
  accepted,
  onAccept,
}: {
  readonly rules: readonly ContentRule[];
  readonly scope: Exclude<ContentRuleScope, 'all'>;
  readonly accepted: boolean;
  readonly onAccept: (accepted: boolean) => void;
}) {
  const id = useId();
  const relevant = rules.filter((rule) => rule.appliesTo === 'all' || rule.appliesTo === scope);
  return (
    <div className="rounded-card bg-paper-2 p-3.5">
      <details>
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold">
          <ShieldCheck size={16} aria-hidden className="text-lagoon" />
          What’s allowed ({relevant.length} rules)
        </summary>
        <ul className="mt-2 flex flex-col gap-2 text-sm">
          {relevant.map((rule) => (
            <li key={rule.id}>
              <span className="font-bold">{rule.title}.</span> <span className="text-text-soft">{rule.body}</span>
            </li>
          ))}
        </ul>
      </details>
      <label htmlFor={id} className="mt-3 flex items-start gap-2.5 text-sm">
        <input id={id} type="checkbox" checked={accepted} onChange={(event) => onAccept(event.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-ink)]" />
        <span>
          My {scope === 'billboard' ? 'ad follows' : 'song follows'} these rules. I understand a moderator reviews it, and I get a full refund if it isn’t approved.
        </span>
      </label>
    </div>
  );
}

/** Thin upload progress bar with a percentage for screen readers. */
export function UploadProgress({ ratio, label }: { readonly ratio: number; readonly label: string }) {
  const pct = Math.round(ratio * 100);
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-1.5 overflow-hidden rounded-full bg-paper-3">
      <div className="h-full rounded-full bg-ink transition-[width] duration-200" style={{ width: `${pct}%` }} />
    </div>
  );
}
