'use client';

import { SearchX } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { JobListingDto } from '@insidelife/shared';
import { Button, EmptyState } from '@/common/components';
import { useSnapshot } from '@/common/game/snapshot';
import { useEmployment, useJobBoard } from '../../hooks/use-jobs-data';
import { filterJobs, industriesOf, missingChips, type BoardScope } from '../../services/job-rules';
import { FilterChips } from '@/common/components';
import { ErrorState, LoadingRows } from '@/common/components';
import { SelectField } from '@/common/components';
import { FreelanceHint } from './FreelanceHint';
import { JobDetailSheet } from './JobDetailSheet';
import { JobRow } from './JobRow';

/** The board: filter by "eligible now" and industry; each row shows pay, hours, place, odds or what's missing. */
export function JobBoardTab() {
  const board = useJobBoard();
  const employment = useEmployment();
  const { data: snapshot } = useSnapshot();
  const [scope, setScope] = useState<BoardScope>('eligible');
  const [industry, setIndustry] = useState('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const jobs = useMemo(() => board.data?.jobs ?? [], [board.data]);
  const visible = useMemo(() => filterJobs(jobs, { scope, industry }), [jobs, scope, industry]);
  const industries = useMemo(() => industriesOf(jobs), [jobs]);
  const eligibleCount = useMemo(() => jobs.filter((job) => job.eligible).length, [jobs]);

  if (board.isPending) return <LoadingRows rows={5} />;
  if (board.isError) return <ErrorState error={board.error} onRetry={() => void board.refetch()} />;

  const context = snapshot ? { age: snapshot.character.age, skills: snapshot.character.skills } : null;
  const open = board.data.applications.filter(
    (application) => application.status === 'pending' || application.status === 'interview',
  ).length;
  const selected: JobListingDto | null = jobs.find((job) => job.id === openId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <FreelanceHint />
      <div className="flex flex-col gap-2.5">
        <FilterChips
          label="Which jobs"
          value={scope}
          onChange={setScope}
          options={[
            { id: 'eligible', label: 'Eligible now', count: eligibleCount },
            { id: 'all', label: 'All jobs', count: jobs.length },
          ]}
        />
        <SelectField
          label="Industry"
          hideLabel
          value={industry}
          onChange={setIndustry}
          options={[
            { value: 'all', label: 'All industries' },
            ...industries.map((name) => ({ value: name, label: name })),
          ]}
        />
        <p className="text-xs text-text-soft">
          {open} of {board.data.maxOpenApplications} applications open · odds are rough guesses, luck still
          plays
        </p>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Nothing here yet"
          body={
            scope === 'eligible'
              ? 'No job you qualify for in this industry. See everything to know what to work on.'
              : 'No jobs in this industry right now.'
          }
          action={
            <Button
              variant="paper"
              onClick={() => (scope === 'eligible' ? setScope('all') : setIndustry('all'))}
            >
              {scope === 'eligible' ? 'Show all jobs' : 'All industries'}
            </Button>
          }
        />
      ) : (
        <ul className="-mx-2 flex flex-col divide-y divide-line px-2">
          {visible.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              chips={context ? missingChips(job.requirements, context) : []}
              onOpen={() => setOpenId(job.id)}
            />
          ))}
        </ul>
      )}

      <JobDetailSheet
        listing={selected}
        openApplications={open}
        maxOpenApplications={board.data.maxOpenApplications}
        currentLevel={employment.data?.employment?.level ?? null}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}
