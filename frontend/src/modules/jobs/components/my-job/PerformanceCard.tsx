import { formatGameDuration, type EmploymentDto } from '@insidelife/shared';
import { Badge, Section } from '@/common/components';
import { Meter } from '../Meter';

/** Attendance this month and rolling performance (what promotions and query letters are made of). */
export function PerformanceCard({ employment }: { readonly employment: EmploymentDto }) {
  const { attendance } = employment;
  const worked = `${Math.round(attendance.workedMinutes / 60)}h`;
  const scheduled = `${Math.round(attendance.scheduledMinutes / 60)}h`;
  return (
    <Section
      title="Attendance & performance"
      aside={
        attendance.strikes > 0 ? (
          <Badge tone="bad">Final warning</Badge>
        ) : attendance.warnings > 0 ? (
          <Badge tone="warn">
            {attendance.warnings} query letter{attendance.warnings === 1 ? '' : 's'}
          </Badge>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 rounded-card bg-paper-2 p-3.5">
        <Meter
          label="Attendance this month"
          ratio={attendance.ratio}
          detail={
            attendance.scheduledMinutes > 0
              ? `Worked ${worked} of ${scheduled}${attendance.lateMinutes > 0 ? ` · late by ${formatGameDuration(attendance.lateMinutes)} in total` : ''}`
              : 'No shifts due yet this month.'
          }
        />
        <Meter
          label="Performance"
          ratio={employment.performance}
          detail="Attendance × mood × how well your skills fit the role."
        />
        {attendance.warnings > 0 && (
          <p className="text-xs text-okada">
            Miss more shifts and the next query letter could be your last. Show up, even if na small.
          </p>
        )}
      </div>
    </Section>
  );
}
