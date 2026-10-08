'use client';

import { formatDate, type EducationOverviewDto } from '@insidelife/shared';
import { Button, HoldButton, Money, Sheet } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useEducationCommands } from '../../hooks/use-education';
import type { SchoolSheet } from '../../hooks/use-school-sheets';
import { announce, complain } from '@/common/game/feedback';
import { acceptanceLines } from '../../services/school-rules';
import { Receipt } from '@/common/components';
import { ApplyForm } from './ApplyForm';
import { RegisterExamForm } from './RegisterExamForm';

const TITLES: Record<SchoolSheet['kind'], string> = {
  register: 'Register',
  apply: 'Apply for admission',
  accept: 'Accept your admission',
  fees: 'Pay school fees',
  programme: 'Enrol',
};

/** The one sheet the School app can show at a time. */
export function SchoolSheets({
  sheet,
  overview,
  onClose,
}: {
  readonly sheet: SchoolSheet | null;
  readonly overview: EducationOverviewDto;
  readonly onClose: () => void;
}) {
  const title = !sheet
    ? ''
    : sheet.kind === 'register'
      ? sheet.exam === 'jamb'
        ? 'Register for JAMB'
        : 'Resit WAEC (GCE)'
      : TITLES[sheet.kind];
  const description =
    sheet?.kind === 'register'
      ? sheet.exam === 'jamb'
        ? 'Pay at a CBT centre, read for a few days, then write.'
        : 'Improve your grades as a private candidate. Result in 7 days.'
      : sheet?.kind === 'apply'
        ? `Your UTME: ${overview.jamb.score ?? '—'}.`
        : undefined;
  return (
    <Sheet open={sheet !== null} onClose={onClose} title={title} description={description}>
      {sheet?.kind === 'register' && (
        <RegisterExamForm overview={overview} exam={sheet.exam} onDone={onClose} />
      )}
      {sheet?.kind === 'apply' && <ApplyForm overview={overview} onDone={onClose} />}
      {sheet?.kind === 'accept' && (
        <AcceptForm overview={overview} applicationId={sheet.applicationId} onDone={onClose} />
      )}
      {sheet?.kind === 'fees' && <FeesForm overview={overview} onDone={onClose} />}
      {sheet?.kind === 'programme' && (
        <ProgrammeForm overview={overview} programmeId={sheet.programmeId} onDone={onClose} />
      )}
    </Sheet>
  );
}

function AcceptForm({
  overview,
  applicationId,
  onDone,
}: {
  readonly overview: EducationOverviewDto;
  readonly applicationId: string;
  readonly onDone: () => void;
}) {
  const { accept } = useEducationCommands();
  const application = overview.applications.find((entry) => entry.id === applicationId);
  if (!application?.acceptance)
    return <p className="pb-4 text-sm text-text-soft">This offer is no longer open.</p>;
  const { lines, total } = acceptanceLines(application.acceptance);
  const confirm = (): void =>
    accept.mutate(application.id, {
      onSuccess: () => {
        gameEvents.emit('celebrate', {
          kind: 'milestone',
          title: 'Admission accepted!',
          body: `${application.courseName}, ${application.institutionName}`,
        });
        announce('Welcome to campus 🎓', {
          body: `${application.courseName} at ${application.institutionName}.`,
          amount: -total,
          sfx: 'celebration',
          serverNotifies: true,
        });
        onDone();
      },
      onError: (error) => complain('Couldn’t accept', error),
    });
  return (
    <div className="flex flex-col gap-4 pb-2">
      <div>
        <p className="type-title text-xl leading-tight">{application.courseName}</p>
        <p className="text-sm text-text-soft">{application.institutionName}</p>
      </div>
      <Receipt
        lines={lines}
        total={{ label: 'You pay now', amount: total }}
        caption={
          application.acceptBy !== null
            ? `Offer stands until ${formatDate(application.acceptBy)}.`
            : undefined
        }
      />
      {application.acceptance.sponsoredByParents && (
        <p className="rounded-card bg-naira-soft p-3 text-sm font-bold text-naira">
          Your parents will pay this session. You only cover the acceptance fee.
        </p>
      )}
      <HoldButton onConfirm={confirm} disabled={accept.isPending}>
        Hold to accept · <Money amount={total} />
      </HoldButton>
    </div>
  );
}

function FeesForm({
  overview,
  onDone,
}: {
  readonly overview: EducationOverviewDto;
  readonly onDone: () => void;
}) {
  const { payFees } = useEducationCommands();
  const enrolment = overview.enrolment;
  if (!enrolment || enrolment.fees.due <= 0)
    return <p className="pb-4 text-sm text-text-soft">Nothing owed right now.</p>;
  const due = enrolment.fees.due;
  return (
    <div className="flex flex-col gap-4 pb-2">
      <Receipt
        lines={[
          {
            label: `${enrolment.institutionName} — session fees`,
            amount: due,
            note: enrolment.livesInHostel ? 'Tuition + hostel' : 'Tuition',
          },
        ]}
        total={{ label: 'You pay now', amount: due }}
        caption={
          enrolment.fees.graceUntil !== null
            ? `Unpaid after ${formatDate(enrolment.fees.graceUntil)} means suspension.`
            : undefined
        }
      />
      <HoldButton
        disabled={payFees.isPending}
        onConfirm={() =>
          payFees.mutate(undefined, {
            onSuccess: () => {
              announce('Fees paid', {
                body: 'Receipt don enter your file. Face your books.',
                amount: -due,
                serverNotifies: true,
              });
              onDone();
            },
            onError: (error) => complain('Payment didn’t go through', error),
          })
        }
      >
        Hold to pay <Money amount={due} />
      </HoldButton>
    </div>
  );
}

function ProgrammeForm({
  overview,
  programmeId,
  onDone,
}: {
  readonly overview: EducationOverviewDto;
  readonly programmeId: string;
  readonly onDone: () => void;
}) {
  const { enrolProgramme } = useEducationCommands();
  const programme = overview.catalogue.programmes.find((entry) => entry.id === programmeId);
  if (!programme) return null;
  return (
    <div className="flex flex-col gap-4 pb-2">
      <div>
        <p className="type-title text-xl leading-tight">{programme.name}</p>
        <p className="text-sm text-text-soft">{programme.provider}</p>
        <p className="mt-2 text-sm">{programme.blurb}</p>
      </div>
      <Receipt
        lines={[{ label: 'Programme fee', amount: programme.cost }]}
        total={{ label: 'You pay now', amount: programme.cost }}
        caption={`${programme.durationDays} game days. Pass and you get: ${programme.grantsLabel}. Study to prepare.`}
      />
      {!programme.eligible && programme.reason && (
        <p className="text-sm font-bold text-okada">{programme.reason}</p>
      )}
      <Button
        size="lg"
        block
        disabled={!programme.eligible}
        loading={enrolProgramme.isPending}
        onClick={() =>
          enrolProgramme.mutate(programme.id, {
            onSuccess: () => {
              announce(`Enrolled: ${programme.name}`, { amount: -programme.cost, serverNotifies: true });
              onDone();
            },
            onError: (error) => complain('Couldn’t enrol', error),
          })
        }
      >
        Enrol and pay <Money amount={programme.cost} />
      </Button>
    </div>
  );
}
