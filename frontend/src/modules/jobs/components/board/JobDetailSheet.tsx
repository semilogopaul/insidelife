'use client';

import { Send } from 'lucide-react';
import type { ReactNode } from 'react';
import { DISTRICTS, formatDate, type JobListingDto } from '@insidelife/shared';
import { Badge, Button, Section, Sheet, Spinner } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useSnapshot } from '@/common/game/snapshot';
import { useApply, useJobDetail } from '../../hooks/use-jobs-data';
import { announce, complain } from '@/common/game/feedback';
import { chanceLabel, describeRequirement, payRangeLabel } from '../../services/job-rules';
import { Checklist } from '../Checklist';
import { GoThere } from '@/common/components';
import { Meter } from '../Meter';
import { CareerLadder } from './CareerLadder';

export interface JobDetailSheetProps {
  readonly listing: JobListingDto | null;
  readonly openApplications: number;
  readonly maxOpenApplications: number;
  readonly currentLevel: number | null;
  readonly onClose: () => void;
}

/** Everything about one job before you apply: workplace, hours, perks, requirements and the career ladder. */
export function JobDetailSheet({
  listing,
  openApplications,
  maxOpenApplications,
  currentLevel,
  onClose,
}: JobDetailSheetProps) {
  const detail = useJobDetail(listing?.id ?? null);
  const apply = useApply();
  const { data: snapshot } = useSnapshot();
  const job = detail.data ?? listing;

  return (
    <Sheet
      open={listing !== null}
      onClose={onClose}
      title={job?.title ?? ''}
      description={job ? `${job.employer} · ${job.industry}` : undefined}
    >
      {job && (
        <div className="flex flex-col gap-5 pb-2">
          <p className="flex items-start gap-3 text-sm">
            <span aria-hidden className="text-3xl leading-none">
              {job.emoji}
            </span>
            <span className="text-text-soft">{job.blurb}</span>
          </p>

          <dl className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-card bg-paper-2 p-3.5 text-sm">
            <Fact label="Pay">{payRangeLabel(job.payRange)}</Fact>
            <Fact label="Hours">
              {job.schedule.label} ({job.schedule.weeklyHours}h a week)
            </Fact>
            <Fact label="Where">
              {job.workplace.mode === 'remote'
                ? job.workplace.label
                : `${job.workplace.label}, ${DISTRICTS[job.workplace.districtId].name}`}
            </Fact>
            <Fact label="Perks">
              <span className="flex flex-wrap gap-1">
                {job.perks.pension && <Badge tone="info">Pension</Badge>}
                {job.perks.hmo && <Badge tone="info">HMO</Badge>}
                {job.perks.holidays && <Badge tone="info">Holidays off</Badge>}
                <Badge>{job.perks.leaveDays} leave days</Badge>
                {!job.perks.paye && <Badge tone="warn">No PAYE at source</Badge>}
              </span>
            </Fact>
            <div className="col-span-2">
              <Meter
                label="Stress"
                ratio={job.stress}
                invert
                detail={job.stress >= 0.6 ? 'High pressure: expect long days and burnout risk.' : undefined}
              />
            </div>
          </dl>

          {job.workplace.mode !== 'remote' && (
            <GoThere venueId={job.workplace.venueId} venueName={job.workplace.name} />
          )}

          <Section
            title="Requirements"
            aside={
              job.eligible ? (
                <Badge tone="good">You qualify</Badge>
              ) : (
                <Badge tone="bad">{job.missing.length} missing</Badge>
              )
            }
          >
            <Checklist
              items={job.requirements.map((check) => ({
                key: check.key,
                label: check.label,
                met: check.met,
                hint: snapshot
                  ? describeRequirement(check, {
                      age: snapshot.character.age,
                      skills: snapshot.character.skills,
                    }).hint
                  : undefined,
              }))}
            />
            {job.requirements.length === 0 && (
              <p className="text-sm text-text-soft">None. Show up and work.</p>
            )}
          </Section>

          <Section title="Career ladder" aside={`${job.levels} levels`}>
            {detail.data ? (
              <CareerLadder ladder={detail.data.ladder} currentLevel={job.current ? currentLevel : null} />
            ) : detail.isError ? (
              <p className="text-sm text-text-soft">Couldn’t load the ladder.</p>
            ) : (
              <Spinner className="text-text-soft" />
            )}
          </Section>

          <ApplyFooter
            job={job}
            openApplications={openApplications}
            maxOpenApplications={maxOpenApplications}
            pending={apply.isPending}
            onApply={() =>
              apply.mutate(job.id, {
                onSuccess: (application) => {
                  if (application.status === 'accepted') {
                    gameEvents.emit('celebrate', {
                      kind: 'milestone',
                      title: 'You got the job!',
                      body: `${application.jobTitle} at ${application.employer}`,
                    });
                    announce('You got the job!', {
                      body: application.message ?? `${application.jobTitle} at ${application.employer}`,
                      sfx: 'level-up',
                    });
                  } else {
                    announce('Application sent', {
                      body: `${application.employer} will reply by ${formatDate(application.decisionExpectedBy)}. Watch your notifications.`,
                    });
                  }
                  onClose();
                },
                onError: (error) => complain('Application not sent', error),
              })
            }
          />
        </div>
      )}
    </Sheet>
  );
}

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold text-text-soft">{label}</dt>
      <dd className="mt-0.5 font-bold">{children}</dd>
    </div>
  );
}

function ApplyFooter({
  job,
  openApplications,
  maxOpenApplications,
  pending,
  onApply,
}: {
  readonly job: JobListingDto;
  readonly openApplications: number;
  readonly maxOpenApplications: number;
  readonly pending: boolean;
  readonly onApply: () => void;
}) {
  const reason = job.current
    ? 'This is your job.'
    : job.application
      ? `Applied — they’ll reply by ${formatDate(job.application.decisionExpectedBy)}.`
      : !job.eligible
        ? 'Meet the requirements above first.'
        : openApplications >= maxOpenApplications
          ? `You have ${openApplications} applications waiting. Wait for replies first.`
          : null;
  return (
    <div className="sticky bottom-0 -mx-5 border-t border-line bg-paper px-5 pt-3">
      <Button
        size="lg"
        block
        icon={<Send size={18} aria-hidden />}
        disabled={reason !== null}
        loading={pending}
        onClick={onApply}
      >
        {reason === null ? `Apply · ${chanceLabel(job.estimatedChance)} chance` : 'Apply'}
      </Button>
      <p className="mt-1.5 min-h-4 text-center text-xs text-text-soft">
        {reason ?? 'Free to apply. Employers reply within a few game days.'}
      </p>
    </div>
  );
}
