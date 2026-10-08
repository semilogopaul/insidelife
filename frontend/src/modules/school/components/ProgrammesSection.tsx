'use client';

import { Award, GraduationCap } from 'lucide-react';
import {
  formatDate,
  type EducationOverviewDto,
  type GameMinute,
  type ProgrammeEnrolmentStatus,
} from '@insidelife/shared';
import { useState } from 'react';
import { Badge, Button, Money, ProgressBar, Section } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { useOpenSchoolSheet } from '../hooks/use-school-sheets';
import { relativeGameTime } from '@/common/utils/game-time';

const STATUS: Record<
  ProgrammeEnrolmentStatus,
  { readonly tone: 'good' | 'bad' | 'info' | 'neutral'; readonly label: string }
> = {
  active: { tone: 'info', label: 'In progress' },
  passed: { tone: 'good', label: 'Passed' },
  failed: { tone: 'bad', label: 'Failed' },
  withdrawn: { tone: 'neutral', label: 'Withdrawn' },
};

/** Professional programmes: what you're doing, and the catalogue (Law School, ICAN, bootcamp, IELTS…). */
export function ProgrammesSection({
  overview,
  now,
}: {
  readonly overview: EducationOverviewDto;
  readonly now: GameMinute;
}) {
  const openSheet = useOpenSchoolSheet();
  const active = overview.programmes.filter((programme) => programme.status === 'active');
  const activeIds = new Set(active.map((programme) => programme.programmeId));
  const [showLocked, setShowLocked] = useState(false);
  const sorted = [...overview.catalogue.programmes].sort(
    (a, b) => Number(b.eligible) - Number(a.eligible) || a.cost - b.cost,
  );
  const lockedCount = sorted.filter((programme) => !programme.eligible).length;
  const catalogue = showLocked
    ? sorted
    : sorted.filter((programme) => programme.eligible || activeIds.has(programme.id));

  return (
    <div id="school-programmes" className="scroll-mt-14">
      <Section title="Professional programmes">
        {overview.programmes.length > 0 && (
          <ul className="flex flex-col gap-2">
            {overview.programmes.map((programme) => (
              <li key={programme.id} className="rounded-card bg-paper-2 p-3.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold">{programme.name}</p>
                  <Badge tone={STATUS[programme.status].tone}>
                    {programme.score !== null
                      ? `Band ${programme.score.toFixed(1)}`
                      : STATUS[programme.status].label}
                  </Badge>
                </div>
                {programme.status === 'active' && (
                  <>
                    <ProgressBar
                      className="mt-2"
                      value={programme.progressPercent}
                      label={`${programme.name} progress`}
                      tone="naira"
                    />
                    <p className="mt-1 text-xs text-text-soft">
                      {programme.prepHours}h of prep · exam {formatDate(programme.endsAt)} (
                      {relativeGameTime(programme.endsAt, now)})
                    </p>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <ul className="-mx-2 flex flex-col divide-y divide-line px-2">
          {catalogue.map((programme) => (
            <li key={programme.id}>
              <button
                type="button"
                disabled={activeIds.has(programme.id)}
                onClick={() => openSheet({ kind: 'programme', programmeId: programme.id })}
                className="flex w-full items-start gap-3 py-3 text-left hover:bg-paper-2/60 disabled:opacity-60"
              >
                <span
                  aria-hidden
                  className={cn(
                    'grid size-10 shrink-0 place-items-center rounded-card',
                    programme.eligible ? 'bg-cobalt-soft text-cobalt' : 'bg-paper-2 text-text-faint',
                  )}
                >
                  <GraduationCap size={20} />
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-bold">{programme.name}</span>
                    <Money amount={programme.cost} compact className="shrink-0 font-bold" />
                  </span>
                  <span className="block text-text-soft">
                    {programme.provider} · {programme.durationDays} days
                  </span>
                  <span
                    className={cn(
                      'mt-0.5 block text-xs font-bold',
                      programme.eligible ? 'text-naira' : 'text-okada',
                    )}
                  >
                    {activeIds.has(programme.id)
                      ? 'Enrolled'
                      : programme.eligible
                        ? `Earns: ${programme.grantsLabel}`
                        : programme.reason}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {lockedCount > 0 && (
          <Button
            variant="paper"
            size="sm"
            className="self-start"
            onClick={() => setShowLocked((value) => !value)}
          >
            {showLocked ? 'Hide locked programmes' : `Show ${lockedCount} you can’t take yet`}
          </Button>
        )}
      </Section>
    </div>
  );
}

/** Degrees and certifications you hold. */
export function CertificatesSection({ overview }: { readonly overview: EducationOverviewDto }) {
  if (overview.degrees.length === 0 && overview.certifications.length === 0) return null;
  return (
    <Section title="Your certificates">
      <ul className="flex flex-col divide-y divide-line">
        {overview.degrees.map((degree) => (
          <li key={degree.enrolmentId} className="flex items-center gap-3 py-2.5 text-sm">
            <GraduationCap size={20} aria-hidden className="shrink-0 text-danfo-deep" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{degree.title}</span>
              <span className="block truncate text-text-soft">
                {degree.institutionName} · {degree.classLabel} ({degree.cgpa.toFixed(2)})
              </span>
            </span>
            <span className="text-xs text-text-soft">{formatDate(degree.graduatedAt).slice(-4)}</span>
          </li>
        ))}
        {overview.certifications.map((certification) => (
          <li key={certification.code} className="flex items-center gap-3 py-2.5 text-sm">
            <Award size={20} aria-hidden className="shrink-0 text-cobalt" />
            <span className="min-w-0 flex-1 truncate font-bold">
              {certification.label}
              {certification.score !== null && (
                <span className="font-normal text-text-soft"> · band {certification.score.toFixed(1)}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
