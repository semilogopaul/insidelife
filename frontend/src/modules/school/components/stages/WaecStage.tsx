'use client';

import { RefreshCcw } from 'lucide-react';
import type { EducationOverviewDto, WaecSubjectResultDto } from '@insidelife/shared';
import { Badge, Button, Money } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { useOpenSchoolSheet } from '../../hooks/use-school-sheets';
import { gradeBand, latestExam, type GradeBand } from '../../services/school-rules';

const BAND_STYLE: Record<GradeBand, string> = {
  distinction: 'bg-ink text-danfo',
  credit: 'bg-naira-soft text-naira',
  pass: 'bg-paper-3 text-text-soft',
  fail: 'bg-okada-soft text-okada',
};

const BAND_WORD: Record<GradeBand, string> = {
  distinction: 'distinction',
  credit: 'credit',
  pass: 'pass, no credit',
  fail: 'fail',
};

/** Best WAEC grade per subject (across resits), as a grid of result-slip tiles. */
export function WaecStage({ overview }: { readonly overview: EducationOverviewDto }) {
  const openSheet = useOpenSchoolSheet();
  const { waec } = overview;
  const gce = latestExam(overview.exams, 'waec-gce');
  const gcePending = gce !== null && gce.status !== 'released';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={waec.hasMaths ? 'good' : 'bad'}>
          {waec.hasMaths ? 'Maths credit' : 'No Maths credit'}
        </Badge>
        <Badge tone={waec.hasEnglish ? 'good' : 'bad'}>
          {waec.hasEnglish ? 'English credit' : 'No English credit'}
        </Badge>
        <Badge tone={waec.meetsUniversityMinimum ? 'good' : 'warn'}>
          {waec.meetsUniversityMinimum ? 'Meets the university minimum' : 'Below the 5-credit minimum'}
        </Badge>
      </div>
      <ul className="grid grid-cols-3 gap-1.5" aria-label="Best grade per subject">
        {waec.best.map((subject) => (
          <GradeTile key={subject.subjectId} subject={subject} />
        ))}
      </ul>
      <p className="text-xs text-text-soft">
        A1–C6 count as credits. Universities want five, including Maths and English.
      </p>
      {gcePending ? (
        <p className="rounded-card bg-paper-2 p-3 text-sm">
          GCE resit in progress at {gce.venueName}.{' '}
          {gce.status === 'registered' ? 'Write it from your exam date.' : 'Result on the way.'}
        </p>
      ) : (
        <Button
          variant="paper"
          size="sm"
          className="self-start"
          icon={<RefreshCcw size={15} aria-hidden />}
          onClick={() => openSheet({ kind: 'register', exam: 'waec-gce' })}
        >
          Resit as GCE · <Money amount={overview.prices.waecGce} compact />
        </Button>
      )}
    </div>
  );
}

function GradeTile({ subject }: { readonly subject: WaecSubjectResultDto }) {
  const band = gradeBand(subject.grade);
  return (
    <li className="flex min-h-[4.25rem] flex-col justify-between rounded-chip bg-paper-2 p-2">
      <span className="line-clamp-2 text-2xs font-bold leading-tight text-text-soft">{subject.label}</span>
      <span
        className={cn(
          'type-figure mt-1 self-start rounded-[4px] px-1.5 text-lg leading-snug',
          BAND_STYLE[band],
        )}
      >
        {subject.grade}
        <span className="sr-only"> ({BAND_WORD[band]})</span>
      </span>
    </li>
  );
}
